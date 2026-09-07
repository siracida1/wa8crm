"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import DOMPurify from "dompurify";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Plus,
  Rocket,
  Send,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Sender {
  id: string;
  name: string;
  email: string;
}
interface Template {
  id: string;
  name: string;
  subject: string;
  html_content: string;
}
interface EmailList {
  id: string;
  name: string;
  recipient_count: number;
}
interface Recipient {
  email: string;
  [key: string]: string;
}
interface Campaign {
  id: string;
  name: string;
  status: "sending" | "completed" | "failed" | "cancelled";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  completed_at: string | null;
}

const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function personalize(subject: string, html: string, recipient: Recipient) {
  let s = subject;
  let h = html;
  Object.keys(recipient).forEach((key) => {
    const regex = new RegExp(`{{${escapeRegExp(key)}}}`, "g");
    s = s.replace(regex, recipient[key] ?? "");
    h = h.replace(regex, recipient[key] ?? "");
  });
  h = h.replace(/{{name}}/g, recipient.name || recipient.nombre || "Cliente");
  return { subject: s, html: h };
}

function statusColor(status: Campaign["status"]) {
  if (status === "completed") return "text-emerald-400 bg-emerald-500/10";
  if (status === "failed" || status === "cancelled") return "text-red-400 bg-red-500/10";
  return "text-primary bg-primary/10";
}

function statusLabel(status: Campaign["status"]) {
  if (status === "sending") return "enviando";
  if (status === "completed") return "completada";
  if (status === "cancelled") return "cancelada";
  return "con errores";
}

export function CampaignsManager() {
  const [view, setView] = useState<"list" | "wizard">("list");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/email/campaigns", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setCampaigns((data.campaigns as Campaign[]) ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live progress: while any campaign is still sending, poll for updated
  // sent/failed counts so "Cancelar" isn't the only way to see it move.
  useEffect(() => {
    if (view !== "list" || !campaigns.some((c) => c.status === "sending")) return;
    const interval = setInterval(() => void refresh(), 3000);
    return () => clearInterval(interval);
  }, [view, campaigns, refresh]);

  const cancelCampaign = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Cancelar esta campaña? Los envíos ya realizados no se deshacen.")) return;
      const res = await fetch(`/api/email/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) {
        toast.error("No se pudo cancelar la campaña.");
        return;
      }
      toast.success("Campaña cancelada.");
      await refresh();
    },
    [refresh],
  );

  if (view === "wizard") {
    return (
      <Wizard
        onCancel={() => setView("list")}
        onComplete={() => {
          setView("list");
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Campañas</h2>
          <p className="text-sm text-muted-foreground">Historial de envíos y nueva campaña.</p>
        </div>
        <Button onClick={() => setView("wizard")}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva campaña
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-10 text-center">
          <Send className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay campañas todavía. Creá la primera.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs">
                <span className="text-emerald-400">{c.sent_count} enviados</span>
                {c.failed_count > 0 && <span className="text-red-400">{c.failed_count} fallidos</span>}
                <span className="text-muted-foreground">/ {c.total_recipients}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${statusColor(c.status)}`}>
                  {statusLabel(c.status)}
                </span>
                {c.status === "sending" && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => cancelCampaign(c.id)}
                    className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <X className="mr-1 h-3 w-3" />
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Wizard({ onCancel, onComplete }: { onCancel: () => void; onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lists, setLists] = useState<EmailList[]>([]);

  const [campaignName, setCampaignName] = useState("");
  const [senderId, setSenderId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [csvSummary, setCsvSummary] = useState({ valid: 0, invalid: 0, duplicates: 0 });
  const [sendDelayMs, setSendDelayMs] = useState("1000");
  const [maxRetries, setMaxRetries] = useState("1");

  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ sent: 0, failed: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    (async () => {
      const [sRes, tRes, lRes] = await Promise.all([
        fetch("/api/email/senders"),
        fetch("/api/email/templates"),
        fetch("/api/email/lists"),
      ]);
      const [sData, tData, lData] = await Promise.all([sRes.json(), tRes.json(), lRes.json()]);
      const senderList: Sender[] = sData.senders ?? [];
      const templateList: Template[] = tData.templates ?? [];
      setSenders(senderList);
      setTemplates(templateList);
      setLists(lData.lists ?? []);
      if (senderList.length === 1) setSenderId(senderList[0].id);
      if (templateList.length === 1) setTemplateId(templateList[0].id);
    })();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().replace(/^﻿/, "").toLowerCase(),
        transform: (v) => v.trim(),
      });
      if (result.errors.length > 0) {
        toast.error("No se pudo leer el CSV.");
        return;
      }
      let invalid = 0;
      let duplicates = 0;
      const seen = new Set<string>();
      const parsed = result.data.filter((row) => {
        const email = row.email?.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          invalid++;
          return false;
        }
        const norm = email.toLowerCase();
        if (seen.has(norm)) {
          duplicates++;
          return false;
        }
        seen.add(norm);
        row.email = email;
        return true;
      }) as Recipient[];
      if (parsed.length === 0) {
        toast.error("El CSV no tiene destinatarios válidos.");
        return;
      }
      setRecipients(parsed);
      setCsvSummary({ valid: parsed.length, invalid, duplicates });
      setUploadedFileName(file.name);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const useSavedList = async (list: EmailList) => {
    const res = await fetch(`/api/email/lists/${list.id}/recipients`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("No se pudo cargar la lista.");
      return;
    }
    const rows = (data.recipients as { email: string; data: Record<string, string> }[]) ?? [];
    const mapped = rows.map((r) => ({ ...r.data, email: r.email }));
    setRecipients(mapped);
    setCsvSummary({ valid: mapped.length, invalid: 0, duplicates: 0 });
    setUploadedFileName(list.name);
  };

  const isStep1Valid = campaignName.trim() && senderId && templateId;
  const isStep2Valid = recipients.length > 0;
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const previewRecipient = recipients[0];
  const previewContent =
    selectedTemplate && previewRecipient
      ? personalize(selectedTemplate.subject, selectedTemplate.html_content, previewRecipient)
      : null;

  const startCampaign = useCallback(async () => {
    setIsSending(true);
    cancelledRef.current = false;

    const res = await fetch("/api/email/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName.trim(),
        sender_id: senderId,
        template_id: templateId,
        total_recipients: recipients.length,
        send_delay_ms: Number(sendDelayMs),
        max_retries: Number(maxRetries),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "No se pudo crear la campaña.");
      setIsSending(false);
      return;
    }
    const campaignId = data.campaign.id as string;

    let sent = 0;
    let failed = 0;
    const delay = Number(sendDelayMs);

    let wasCancelled = false;

    for (let i = 0; i < recipients.length; i++) {
      if (cancelledRef.current) break;
      const recipient = recipients[i];
      try {
        const sendRes = await fetch(`/api/email/campaigns/${campaignId}/send-one`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient }),
        });
        const result = await sendRes.json().catch(() => ({ success: false }));
        // The server is the actual kill switch — it refuses to send once
        // the campaign's been cancelled from another tab/session, which
        // is the only way "Cancelar campaña" can stop a loop that's
        // running here in the browser.
        if (result.cancelled) {
          wasCancelled = true;
          break;
        }
        if (result.success) sent++;
        else failed++;
      } catch {
        failed++;
      }
      setStats({ sent, failed });
      setProgress(Math.round(((i + 1) / recipients.length) * 100));
      if (delay > 0 && i < recipients.length - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    if (!wasCancelled) {
      await fetch(`/api/email/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: failed > 0 ? "failed" : "completed" }),
      });
    }

    setTimeout(() => onComplete(), 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignName, senderId, templateId, recipients, sendDelayMs, maxRetries]);

  if (isSending) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-border">
          {progress < 100 ? (
            <Rocket className="h-10 w-10 text-primary" />
          ) : (
            <Check className="h-10 w-10 animate-bounce text-emerald-400" />
          )}
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">
            {progress < 100 ? "Enviando..." : "¡Listo!"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress}% · {stats.sent} enviados · {stats.failed} fallidos
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Nueva campaña</h2>
        <Button variant="ghost" size="icon-sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card p-6">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <Label className="mb-1.5 block text-sm font-medium">Nombre de la campaña</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Newsletter de agosto"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Cuenta de envío</Label>
                {senders.length === 0 ? (
                  <p className="rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    No hay cuentas de envío. Creá una en la pestaña Cuentas.
                  </p>
                ) : (
                  <Select value={senderId} onValueChange={(v) => v && setSenderId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {senders.find((s) => s.id === senderId)?.name || "Elegir cuenta"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {senders.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Plantilla</Label>
                {templates.length === 0 ? (
                  <p className="rounded-md border border-dashed border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    No hay plantillas. Creá una en la pestaña Plantillas.
                  </p>
                ) : (
                  <Select value={templateId} onValueChange={(v) => v && setTemplateId(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {templates.find((t) => t.id === templateId)?.name || "Elegir plantilla"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {lists.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Usar una lista guardada</p>
                <div className="grid grid-cols-2 gap-2">
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => useSavedList(l)}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        uploadedFileName === l.name
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{l.recipient_count} contactos</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Upload className="mx-auto mb-2 h-7 w-7 text-primary" />
              <p className="text-sm font-medium text-foreground">O subí un CSV para este envío</p>
              <p className="mt-1 text-xs text-muted-foreground">Necesita una columna &ldquo;email&rdquo;.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {recipients.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <div>
                  <strong>{csvSummary.valid} destinatarios listos</strong>
                  {csvSummary.invalid > 0 ? ` · ${csvSummary.invalid} inválidos` : ""}
                  {csvSummary.duplicates > 0 ? ` · ${csvSummary.duplicates} duplicados` : ""}
                </div>
                <button
                  onClick={() => {
                    setRecipients([]);
                    setUploadedFileName("");
                  }}
                  className="shrink-0 font-semibold underline"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Revisá antes de enviar</p>
                <p className="mt-0.5 text-xs opacity-90">
                  Esta acción envía emails reales a {recipients.length} destinatarios.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3 rounded-lg bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detalles
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Campaña</span>
                  <span className="font-medium text-foreground">{campaignName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Destinatarios</span>
                  <span className="font-medium text-foreground">{recipients.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cuenta</span>
                  <span className="font-medium text-foreground">
                    {senders.find((s) => s.id === senderId)?.email}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plantilla</span>
                  <span className="font-medium text-foreground">{selectedTemplate?.name}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Demora entre envíos</Label>
                    <Select value={sendDelayMs} onValueChange={(v) => v && setSendDelayMs(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Sin demora</SelectItem>
                        <SelectItem value="1000">1 segundo</SelectItem>
                        <SelectItem value="3000">3 segundos</SelectItem>
                        <SelectItem value="5000">5 segundos</SelectItem>
                        <SelectItem value="10000">10 segundos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Reintentos</Label>
                    <Select value={maxRetries} onValueChange={(v) => v && setMaxRetries(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0</SelectItem>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">Listo para enviar</p>
                {previewContent && (
                  <div className="w-full rounded-lg border border-border bg-background text-left">
                    <div className="border-b border-border px-3 py-2">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {previewContent.subject}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Vista previa · {previewRecipient.email}
                      </p>
                    </div>
                    <div
                      className="max-h-40 overflow-y-auto p-3 text-xs text-foreground"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(previewContent.html, {
                          USE_PROFILES: { html: true },
                        }),
                      }}
                    />
                  </div>
                )}
                <Button onClick={startCampaign} className="w-full">
                  <Rocket className="mr-1.5 h-4 w-4" />
                  Lanzar campaña
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
          <Button
            variant="ghost"
            onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {step === 1 ? "Cancelar" : "Atrás"}
          </Button>
          {step < 3 && (
            <Button
              disabled={(step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid)}
              onClick={() => setStep(step + 1)}
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
