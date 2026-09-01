"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, Pencil, Plus, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmailSender {
  id: string;
  name: string;
  email: string;
  host: string;
  port: number;
  smtp_user: string;
  is_default: boolean;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  created_at: string;
}

interface DraftState {
  id?: string;
  name: string;
  email: string;
  host: string;
  port: number;
  smtp_user: string;
  smtp_password: string;
  is_default: boolean;
  imap_host: string;
  imap_port: number | "";
  imap_user: string;
  imap_password: string;
}

function emptyDraft(hasSenders: boolean): DraftState {
  return {
    name: "",
    email: "",
    host: "smtp.gmail.com",
    port: 587,
    smtp_user: "",
    smtp_password: "",
    is_default: !hasSenders,
    imap_host: "",
    imap_port: "",
    imap_user: "",
    imap_password: "",
  };
}

type TestState = { status: "idle" | "testing" | "success" | "error"; message: string };

export function SendersManager() {
  const [items, setItems] = useState<EmailSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/senders", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems((data.senders as EmailSender[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setTest({ status: "idle", message: "" });
    setDraft(emptyDraft(items.length > 0));
  };

  const openEdit = (s: EmailSender) => {
    setTest({ status: "idle", message: "" });
    setDraft({
      id: s.id,
      name: s.name,
      email: s.email,
      host: s.host,
      port: s.port,
      smtp_user: s.smtp_user,
      smtp_password: "",
      is_default: s.is_default,
      imap_host: s.imap_host ?? "",
      imap_port: s.imap_port ?? "",
      imap_user: s.imap_user ?? "",
      imap_password: "",
    });
  };

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.email.trim()) {
      toast.error("Nombre y email son obligatorios.");
      return;
    }
    if (!draft.id && !draft.smtp_password) {
      toast.error("La contraseña SMTP es obligatoria.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/email/senders/${draft.id}` : "/api/email/senders",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la cuenta.");
        return;
      }
      toast.success(draft.id ? "Cuenta actualizada." : "Cuenta creada.");
      setDraft(null);
      await load();
    } catch {
      toast.error("No se pudo guardar la cuenta.");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta cuenta de envío?")) return;
      const res = await fetch(`/api/email/senders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("No se pudo eliminar la cuenta.");
        return;
      }
      await load();
    },
    [load],
  );

  const runTest = useCallback(async () => {
    if (!draft) return;
    if (!draft.id && (!draft.host || !draft.smtp_user || !draft.smtp_password)) {
      setTest({ status: "error", message: "Completá host, usuario y contraseña." });
      return;
    }
    setTest({ status: "testing", message: "Probando conexión..." });
    try {
      const res = await fetch("/api/email/senders/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Testing a saved sender with a blank password field means "use
        // the stored one" — send by id so the real secret never round-trips
        // through the browser.
        body: JSON.stringify(
          draft.id && !draft.smtp_password ? { id: draft.id } : draft,
        ),
      });
      const data = await res.json().catch(() => ({}));
      setTest(
        data.success
          ? { status: "success", message: "Conexión exitosa." }
          : { status: "error", message: data.error ?? "Fallo la conexión." },
      );
    } catch {
      setTest({ status: "error", message: "Fallo la conexión." });
    }
  }, [draft]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Cuentas de envío</h2>
          <p className="text-sm text-muted-foreground">
            Cuentas SMTP desde las que se envían las campañas.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-10 text-center">
          <Mail className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay cuentas de envío todavía. Agregá una para poder mandar campañas.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((s) => (
            <div
              key={s.id}
              className="flex flex-col rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Server className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(s.id)}
                    className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Servidor
                  </p>
                  <p className="truncate text-xs font-medium text-foreground">{s.host}</p>
                </div>
                <div className="rounded-md bg-muted/50 p-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Puerto
                  </p>
                  <p className="text-xs font-medium text-foreground">{s.port}</p>
                </div>
              </div>
              {s.is_default && (
                <div className="mt-3 flex items-center gap-1.5 text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Predeterminada</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar cuenta" : "Nueva cuenta de envío"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Zittex Marketing"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                    placeholder="marketing@zittex.com"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Servidor SMTP</Label>
                <Input
                  value={draft.host}
                  onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Puerto</Label>
                  <Input
                    type="number"
                    value={draft.port}
                    onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Usuario</Label>
                  <Input
                    value={draft.smtp_user}
                    onChange={(e) => setDraft({ ...draft, smtp_user: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Contraseña</Label>
                <Input
                  type="password"
                  value={draft.smtp_password}
                  onChange={(e) => setDraft({ ...draft, smtp_password: e.target.value })}
                  placeholder={draft.id ? "Dejar en blanco para no cambiarla" : "••••••••••••"}
                />
              </div>
              <label className="flex items-center gap-2 pt-1">
                <Switch
                  checked={draft.is_default}
                  onCheckedChange={(v) => setDraft({ ...draft, is_default: v })}
                />
                <span className="text-sm text-muted-foreground">Usar como predeterminada</span>
              </label>

              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground">
                  IMAP — recibir respuestas en el Inbox (opcional)
                </p>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Suele ser un host distinto al de SMTP (ej. Gmail: imap.gmail.com:993).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Servidor IMAP</Label>
                    <Input
                      value={draft.imap_host}
                      onChange={(e) => setDraft({ ...draft, imap_host: e.target.value })}
                      placeholder="imap.gmail.com"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Puerto</Label>
                    <Input
                      type="number"
                      value={draft.imap_port}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          imap_port: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                      placeholder="993"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Usuario</Label>
                    <Input
                      value={draft.imap_user}
                      onChange={(e) => setDraft({ ...draft, imap_user: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Contraseña</Label>
                    <Input
                      type="password"
                      value={draft.imap_password}
                      onChange={(e) => setDraft({ ...draft, imap_password: e.target.value })}
                      placeholder={draft.id ? "Dejar en blanco para no cambiarla" : "••••••••••••"}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">Probar conexión</p>
                    <p
                      className={`truncate text-xs ${
                        test.status === "success"
                          ? "text-emerald-400"
                          : test.status === "error"
                            ? "text-red-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {test.message || "Verificá las credenciales antes de guardar."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={runTest}
                    disabled={test.status === "testing"}
                  >
                    {test.status === "testing" && (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    )}
                    Probar
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
