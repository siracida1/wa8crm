"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  Building2,
  Download,
  Globe2,
  ListChecks,
  Loader2,
  MapPin,
  Tags,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmailList {
  id: string;
  name: string;
  classification: string | null;
  zone: string | null;
  city: string | null;
  country: string | null;
  source_file_name: string | null;
  recipient_count: number;
  created_at: string;
  updated_at: string;
}

interface Recipient {
  email: string;
  [key: string]: string;
}

const emptySummary = { valid: 0, invalid: 0, duplicates: 0 };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeCsvValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseRecipientCsvRaw(text: string) {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^﻿/, ""),
    transform: (value) => value.trim(),
  });
  if (result.errors.length > 0) {
    throw new Error("El archivo CSV no se pudo leer correctamente. Revisá el formato e intentá de nuevo.");
  }
  const headers = result.meta.fields || [];
  if (headers.length === 0) throw new Error("El CSV no tiene columnas.");
  return { headers, rows: result.data };
}

function cleanVarName(header: string) {
  const cleaned = header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "campo";
}

function guessColumnMapping(header: string, sampleValues: string[]) {
  const h = header.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (h.includes("mail")) return "email";
  const nonEmpty = sampleValues.filter((v) => v);
  const emailish = nonEmpty.filter((v) => EMAIL_REGEX.test(v));
  if (nonEmpty.length > 0 && emailish.length / nonEmpty.length > 0.5) return "email";
  return cleanVarName(header);
}

function buildRecipientsFromMapping(
  rows: Record<string, string>[],
  headers: string[],
  mapping: Record<string, string>,
) {
  const activeMappings = headers
    .map((header) => ({ header, varName: mapping[header]?.trim() }))
    .filter((m): m is { header: string; varName: string } => Boolean(m.varName));

  let invalid = 0;
  let duplicates = 0;
  const seenEmails = new Set<string>();
  const recipients: Recipient[] = [];

  rows.forEach((row) => {
    const recipient: Recipient = { email: "" };
    activeMappings.forEach(({ header, varName }) => {
      recipient[varName] = row[header] ?? "";
    });
    const email = recipient.email?.trim();
    if (!email || !EMAIL_REGEX.test(email)) {
      invalid++;
      return;
    }
    const normalizedEmail = email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) {
      duplicates++;
      return;
    }
    seenEmails.add(normalizedEmail);
    recipient.email = email;
    recipients.push(recipient);
  });

  return { recipients, summary: { valid: recipients.length, invalid, duplicates } };
}

function metadataChips(list: EmailList) {
  return [
    { label: list.classification, icon: Tags },
    { label: list.zone, icon: MapPin },
    { label: list.city, icon: Building2 },
    { label: list.country, icon: Globe2 },
  ].filter((c): c is { label: string; icon: typeof Tags } => Boolean(c.label));
}

export function ListsManager() {
  const [items, setItems] = useState<EmailList[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [importName, setImportName] = useState("");
  const [classification, setClassification] = useState("");
  const [zone, setZone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsedRecipients, setParsedRecipients] = useState<Recipient[]>([]);
  const [csvSummary, setCsvSummary] = useState(emptySummary);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/lists", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems((data.lists as EmailList[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetImportForm = () => {
    setImportName("");
    setClassification("");
    setZone("");
    setCity("");
    setCountry("");
    setSourceFileName("");
    setCsvHeaders([]);
    setCsvRawRows([]);
    setColumnMapping({});
    setParsedRecipients([]);
    setCsvSummary(emptySummary);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeImport = () => {
    setIsImportOpen(false);
    resetImportForm();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const { headers, rows } = parseRecipientCsvRaw(text);
        const mapping: Record<string, string> = {};
        headers.forEach((header) => {
          const sampleValues = rows.slice(0, 15).map((row) => row[header] || "");
          mapping[header] = guessColumnMapping(header, sampleValues);
        });
        setCsvHeaders(headers);
        setCsvRawRows(rows);
        setColumnMapping(mapping);
        setParsedRecipients([]);
        setCsvSummary(emptySummary);
        setSourceFileName(file.name);
        if (!importName.trim()) {
          setImportName(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        setCsvHeaders([]);
        setCsvRawRows([]);
        setColumnMapping({});
        setParsedRecipients([]);
        setCsvSummary(emptySummary);
      }
    };
    reader.readAsText(file);
  };

  const confirmColumnMapping = () => {
    const hasEmailMapping = Object.values(columnMapping).some((v) => v.trim() === "email");
    if (!hasEmailMapping) {
      toast.error("Mapeá al menos una columna a 'email'.");
      return;
    }
    const { recipients, summary } = buildRecipientsFromMapping(csvRawRows, csvHeaders, columnMapping);
    if (recipients.length === 0) {
      toast.error("Ninguna fila tiene un email válido.");
      return;
    }
    setParsedRecipients(recipients);
    setCsvSummary(summary);
  };

  const editColumnMapping = () => {
    setParsedRecipients([]);
    setCsvSummary(emptySummary);
  };

  const saveImportedList = useCallback(async () => {
    const name = importName.trim();
    if (!name || parsedRecipients.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/email/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          classification,
          zone,
          city,
          country,
          source_file_name: sourceFileName,
          recipients: parsedRecipients,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la lista.");
        return;
      }
      toast.success("Lista importada.");
      closeImport();
      await load();
    } catch {
      toast.error("No se pudo guardar la lista.");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importName, classification, zone, city, country, sourceFileName, parsedRecipients, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta lista y todos sus contactos?")) return;
      const res = await fetch(`/api/email/lists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("No se pudo eliminar la lista.");
        return;
      }
      await load();
    },
    [load],
  );

  const exportList = useCallback(async (list: EmailList) => {
    const res = await fetch(`/api/email/lists/${list.id}/recipients`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("No se pudo exportar la lista.");
      return;
    }
    const recipients = (data.recipients as { email: string; data: Record<string, string> }[]) ?? [];
    const headers = Array.from(
      new Set(recipients.flatMap((r) => Object.keys(r.data ?? { email: r.email }))),
    );
    const csv = [
      headers.join(","),
      ...recipients.map((r) => headers.map((h) => escapeCsvValue(r.data?.[h])).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${list.name.replace(/[^a-z0-9-_]+/gi, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Listas</h2>
          <p className="text-sm text-muted-foreground">
            Listas de contactos importadas desde CSV.
          </p>
        </div>
        <Button onClick={() => setIsImportOpen(true)}>
          <Upload className="mr-1 h-4 w-4" />
          Importar CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay listas todavía. Importá un CSV para crear la primera.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((list) => (
            <div key={list.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ListChecks className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{list.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {list.recipient_count} destinatario{list.recipient_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => exportList(list)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(list.id)}
                    className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {metadataChips(list).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {metadataChips(list).map(({ label, icon: Icon }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground">
                {list.source_file_name ? `Origen: ${list.source_file_name} · ` : ""}
                Actualizada {new Date(list.updated_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isImportOpen} onOpenChange={(o) => !o && closeImport()}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar lista desde CSV</DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Upload className="mx-auto mb-2 h-7 w-7 text-primary" />
              <p className="text-sm font-medium text-foreground">
                {sourceFileName || "Seleccionar archivo CSV"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Las columnas se mapean automáticamente — podés ajustarlas.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {csvHeaders.length > 0 && parsedRecipients.length === 0 && (
              <div className="rounded-lg border border-border">
                <div className="border-b border-border bg-muted/30 px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">Mapeo de columnas</p>
                  <p className="text-[11px] text-muted-foreground">
                    Una columna debe mapearse a &ldquo;email&rdquo;. Dejá en blanco para ignorar una columna.
                  </p>
                </div>
                <div className="max-h-56 divide-y divide-border overflow-y-auto">
                  {csvHeaders.map((header) => (
                    <div key={header} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 truncate text-xs text-muted-foreground" title={header}>
                        {header}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <Input
                        value={columnMapping[header] || ""}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({ ...prev, [header]: e.target.value }))
                        }
                        placeholder="ignorar"
                        className={`h-7 w-36 text-xs ${
                          columnMapping[header]?.trim() === "email"
                            ? "border-primary bg-primary/10 font-semibold text-primary"
                            : ""
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end border-t border-border bg-muted/30 px-3 py-2">
                  <Button size="sm" onClick={confirmColumnMapping}>
                    Confirmar mapeo
                  </Button>
                </div>
              </div>
            )}

            {parsedRecipients.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <div>
                  <strong>{csvSummary.valid} válidos</strong>
                  {csvSummary.invalid > 0 ? ` · ${csvSummary.invalid} inválidos` : ""}
                  {csvSummary.duplicates > 0 ? ` · ${csvSummary.duplicates} duplicados` : ""}
                </div>
                <button onClick={editColumnMapping} className="shrink-0 font-semibold underline">
                  Editar mapeo
                </button>
              </div>
            )}

            {parsedRecipients.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="mb-1 block text-xs text-muted-foreground">Nombre de la lista</Label>
                  <Input value={importName} onChange={(e) => setImportName(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Clasificación</Label>
                  <Input value={classification} onChange={(e) => setClassification(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Zona</Label>
                  <Input value={zone} onChange={(e) => setZone(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Ciudad</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">País</Label>
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeImport} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={saveImportedList}
              disabled={saving || !importName.trim() || parsedRecipients.length === 0}
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Guardar lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
