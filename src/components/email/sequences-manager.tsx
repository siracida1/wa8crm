"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Hourglass,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
}
interface Sender {
  id: string;
  name: string;
  email: string;
  is_default: boolean;
}
interface Template {
  id: string;
  name: string;
}

type StepDraft =
  | { step_type: "wait"; step_config: { amount: number; unit: "minutes" | "hours" | "days" } }
  | { step_type: "send_email"; step_config: { sender_id?: string; template_id: string } };

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: { list_id?: string };
  is_active: boolean;
  execution_count: number;
}

interface SequenceDraft {
  id?: string;
  name: string;
  list_id: string;
  is_active: boolean;
  steps: StepDraft[];
}

function emptyDraft(): SequenceDraft {
  return { name: "", list_id: "", is_active: true, steps: [] };
}

export function SequencesManager() {
  const [sequences, setSequences] = useState<Automation[]>([]);
  const [lists, setLists] = useState<EmailList[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<SequenceDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, lRes, sRes, tRes] = await Promise.all([
        fetch("/api/automations", { cache: "no-store" }),
        fetch("/api/email/lists", { cache: "no-store" }),
        fetch("/api/email/senders", { cache: "no-store" }),
        fetch("/api/email/templates", { cache: "no-store" }),
      ]);
      const [aData, lData, sData, tData] = await Promise.all([
        aRes.json(),
        lRes.json(),
        sRes.json(),
        tRes.json(),
      ]);
      setSequences(
        ((aData.automations as Automation[]) ?? []).filter(
          (a) => a.trigger_type === "email_list_joined",
        ),
      );
      setLists(lData.lists ?? []);
      setSenders(sData.senders ?? []);
      setTemplates(tData.templates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const listName = (id?: string) => lists.find((l) => l.id === id)?.name ?? "?";

  const openCreate = () => setDraft(emptyDraft());

  const openEdit = async (seq: Automation) => {
    const res = await fetch(`/api/automations/${seq.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("No se pudo cargar la secuencia.");
      return;
    }
    const steps: StepDraft[] = (data.steps ?? []).map((s: { step_type: string; step_config: Record<string, unknown> }) => ({
      step_type: s.step_type,
      step_config: s.step_config,
    }));
    setDraft({
      id: seq.id,
      name: seq.name,
      list_id: seq.trigger_config?.list_id ?? "",
      is_active: seq.is_active,
      steps,
    });
  };

  const addStep = (type: StepDraft["step_type"]) => {
    if (!draft) return;
    const step: StepDraft =
      type === "wait"
        ? { step_type: "wait", step_config: { amount: 1, unit: "days" } }
        : { step_type: "send_email", step_config: { template_id: "" } };
    setDraft({ ...draft, steps: [...draft.steps, step] });
  };

  const updateStep = (index: number, step: StepDraft) => {
    if (!draft) return;
    const steps = [...draft.steps];
    steps[index] = step;
    setDraft({ ...draft, steps });
  };

  const removeStep = (index: number) => {
    if (!draft) return;
    setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) });
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    if (!draft) return;
    const target = index + dir;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps });
  };

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Ponele un nombre a la secuencia.");
      return;
    }
    if (!draft.list_id) {
      toast.error("Elegí qué lista dispara la secuencia.");
      return;
    }
    if (draft.steps.length === 0) {
      toast.error("Agregá al menos un paso.");
      return;
    }
    for (const s of draft.steps) {
      if (s.step_type === "send_email" && !s.step_config.template_id) {
        toast.error("Cada paso 'Enviar email' necesita una plantilla.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        trigger_type: "email_list_joined",
        trigger_config: { list_id: draft.list_id },
        is_active: draft.is_active,
        steps: draft.steps,
      };
      const res = await fetch(draft.id ? `/api/automations/${draft.id}` : "/api/automations", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la secuencia.");
        return;
      }
      toast.success(draft.id ? "Secuencia actualizada." : "Secuencia creada.");
      setDraft(null);
      await load();
    } catch {
      toast.error("No se pudo guardar la secuencia.");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const toggleActive = useCallback(
    async (seq: Automation) => {
      const res = await fetch(`/api/automations/${seq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !seq.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo cambiar el estado.");
        return;
      }
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta secuencia?")) return;
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("No se pudo eliminar la secuencia.");
        return;
      }
      await load();
    },
    [load],
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Secuencias</h2>
          <p className="text-sm text-muted-foreground">
            Automatizaciones de email: cuando alguien se une a una lista, enviá una serie de
            emails con demoras entre pasos.
          </p>
        </div>
        <Button onClick={openCreate} disabled={lists.length === 0 || templates.length === 0}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva secuencia
        </Button>
      </div>

      {(lists.length === 0 || templates.length === 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          Necesitás al menos una lista y una plantilla para crear una secuencia.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sequences.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-10 text-center">
          <Workflow className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay secuencias todavía. Creá la primera.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{seq.name}</p>
                <p className="text-xs text-muted-foreground">
                  Lista: {listName(seq.trigger_config?.list_id)} · {seq.execution_count} ejecuciones
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Switch checked={seq.is_active} onCheckedChange={() => toggleActive(seq)} />
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(seq)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(seq.id)}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar secuencia" : "Nueva secuencia"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Bienvenida — 3 emails"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">
                  Disparador: se une a la lista
                </Label>
                <Select value={draft.list_id} onValueChange={(v) => v && setDraft({ ...draft, list_id: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{listName(draft.list_id) || "Elegir lista"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.is_active}
                  onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
                />
                <span className="text-sm text-muted-foreground">Activa</span>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Pasos (en orden)</Label>
                  <div className="flex gap-1">
                    <Button variant="outline" size="xs" onClick={() => addStep("wait")}>
                      <Hourglass className="mr-1 h-3 w-3" /> Esperar
                    </Button>
                    <Button variant="outline" size="xs" onClick={() => addStep("send_email")}>
                      <Mail className="mr-1 h-3 w-3" /> Enviar email
                    </Button>
                  </div>
                </div>

                {draft.steps.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Sin pasos. Agregá "Esperar" o "Enviar email" arriba.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {draft.steps.map((step, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="mt-1 flex shrink-0 flex-col gap-0.5">
                          <button
                            onClick={() => moveStep(i, -1)}
                            disabled={i === 0}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => moveStep(i, 1)}
                            disabled={i === draft.steps.length - 1}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex-1">
                          {step.step_type === "wait" ? (
                            <div className="flex items-center gap-2">
                              <Hourglass className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Esperar</span>
                              <Input
                                type="number"
                                min={1}
                                value={step.step_config.amount}
                                onChange={(e) =>
                                  updateStep(i, {
                                    ...step,
                                    step_config: {
                                      ...step.step_config,
                                      amount: Number(e.target.value) || 1,
                                    },
                                  })
                                }
                                className="h-7 w-16"
                              />
                              <Select
                                value={step.step_config.unit}
                                onValueChange={(v) =>
                                  v &&
                                  updateStep(i, {
                                    ...step,
                                    step_config: {
                                      ...step.step_config,
                                      unit: v as "minutes" | "hours" | "days",
                                    },
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="minutes">minutos</SelectItem>
                                  <SelectItem value="hours">horas</SelectItem>
                                  <SelectItem value="days">días</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">Enviar</span>
                              <Select
                                value={step.step_config.template_id}
                                onValueChange={(v) =>
                                  v &&
                                  updateStep(i, {
                                    ...step,
                                    step_config: { ...step.step_config, template_id: v },
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 flex-1">
                                  <SelectValue>
                                    {templates.find((t) => t.id === step.step_config.template_id)
                                      ?.name || "Elegir plantilla"}
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
                              <span className="text-xs text-muted-foreground">desde</span>
                              <Select
                                value={step.step_config.sender_id ?? "__default__"}
                                onValueChange={(v) =>
                                  updateStep(i, {
                                    ...step,
                                    step_config: {
                                      ...step.step_config,
                                      sender_id: v && v !== "__default__" ? v : undefined,
                                    },
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__default__">predeterminada</SelectItem>
                                  {senders.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeStep(i)}
                          className="shrink-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
