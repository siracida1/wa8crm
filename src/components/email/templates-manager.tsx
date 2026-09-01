"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  created_at: string;
}

interface DraftState {
  id?: string;
  name: string;
  subject: string;
  html_content: string;
}

const DEFAULT_HTML =
  "<html>\n  <body>\n    <h1>¡Hola {{name}}!</h1>\n    <p>Este es tu contenido.</p>\n  </body>\n</html>";

const PLACEHOLDERS = [
  { tag: "{{name}}", label: "Nombre del contacto" },
  { tag: "{{email}}", label: "Email del contacto" },
  { tag: "{{company}}", label: "Empresa" },
];

function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["style"],
    ADD_ATTR: ["target"],
  });
}

function emptyDraft(): DraftState {
  return { name: "", subject: "", html_content: DEFAULT_HTML };
}

export function TemplatesManager() {
  const [items, setItems] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/templates", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems((data.templates as EmailTemplate[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => setDraft(emptyDraft());
  const openEdit = (t: EmailTemplate) =>
    setDraft({ id: t.id, name: t.name, subject: t.subject, html_content: t.html_content });

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.subject.trim()) {
      toast.error("El asunto es obligatorio.");
      return;
    }
    if (!draft.html_content.trim()) {
      toast.error("El contenido HTML es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        draft.id ? `/api/email/templates/${draft.id}` : "/api/email/templates",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la plantilla.");
        return;
      }
      toast.success(draft.id ? "Plantilla actualizada." : "Plantilla creada.");
      setDraft(null);
      await load();
    } catch {
      toast.error("No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar esta plantilla?")) return;
      const res = await fetch(`/api/email/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("No se pudo eliminar la plantilla.");
        return;
      }
      await load();
    },
    [load],
  );

  const duplicate = useCallback(
    async (t: EmailTemplate) => {
      const res = await fetch("/api/email/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${t.name} (copia)`,
          subject: t.subject,
          html_content: t.html_content,
        }),
      });
      if (!res.ok) {
        toast.error("No se pudo duplicar la plantilla.");
        return;
      }
      toast.success("Plantilla duplicada.");
      await load();
    },
    [load],
  );

  const exportHtml = (t: { name?: string; html_content?: string }) => {
    if (!t.html_content) return;
    const blob = new Blob([t.html_content], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${(t.name || "plantilla").replace(/[^a-z0-9-_]+/gi, "_")}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const importHtml = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              name: prev.name || file.name.replace(/\.[^.]+$/, ""),
              html_content: String(event.target?.result || ""),
            }
          : prev,
      );
    };
    reader.readAsText(file);
  };

  const insertPlaceholder = (tag: string) => {
    if (!draft) return;
    const textarea = textareaRef.current;
    if (!textarea) {
      setDraft({ ...draft, html_content: draft.html_content + tag });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${draft.html_content.slice(0, start)}${tag}${draft.html_content.slice(end)}`;
    setDraft({ ...draft, html_content: next });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plantillas</h2>
          <p className="text-sm text-muted-foreground">
            Plantillas HTML reutilizables para tus campañas.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva plantilla
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border py-10 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No hay plantillas todavía. Creá una para usarla en tus campañas.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <div
              key={t.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="relative h-32 overflow-hidden border-b border-border bg-muted/30">
                <div
                  className="pointer-events-none h-full w-full origin-top scale-50 opacity-50"
                  dangerouslySetInnerHTML={{ __html: sanitize(t.html_content) }}
                />
                <div className="absolute inset-x-0 top-2 flex justify-end gap-1 px-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="secondary" size="icon-sm" onClick={() => duplicate(t)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="secondary" size="icon-sm" onClick={() => exportHtml(t)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
                <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                  &ldquo;{t.subject}&rdquo;
                </p>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(t.id)}
                      className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{draft?.id ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importHtml(file);
                    e.currentTarget.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => fileInputRef.current?.click()}
                  title="Importar HTML"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => draft && exportHtml(draft)}
                  disabled={!draft?.html_content}
                  title="Exportar HTML"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          {draft && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Nombre</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Newsletter mensual"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Asunto</Label>
                  <Input
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    placeholder="Asunto del email"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Variables:</span>
                {PLACEHOLDERS.map((p) => (
                  <Button
                    key={p.tag}
                    variant="outline"
                    size="xs"
                    onClick={() => insertPlaceholder(p.tag)}
                    title={p.label}
                  >
                    <code>{p.tag}</code>
                  </Button>
                ))}
              </div>

              <Tabs defaultValue="code" className="min-h-0 flex-1">
                <TabsList>
                  <TabsTrigger value="code">
                    <Code className="mr-1.5 h-3.5 w-3.5" /> Código
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Vista previa
                  </TabsTrigger>
                  <TabsTrigger value="split">
                    <Columns2 className="mr-1.5 h-3.5 w-3.5" /> Dividido
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="code" className="mt-2">
                  <Textarea
                    ref={textareaRef}
                    value={draft.html_content}
                    onChange={(e) => setDraft({ ...draft, html_content: e.target.value })}
                    className="min-h-64 bg-muted font-mono text-xs"
                    spellCheck={false}
                  />
                </TabsContent>
                <TabsContent value="preview" className="mt-2">
                  <div
                    className="min-h-64 overflow-y-auto rounded-lg border border-border bg-white p-4 text-black"
                    dangerouslySetInnerHTML={{
                      __html: sanitize(draft.html_content.replace(/{{name}}/g, "Cliente Estimado")),
                    }}
                  />
                </TabsContent>
                <TabsContent value="split" className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Textarea
                      value={draft.html_content}
                      onChange={(e) => setDraft({ ...draft, html_content: e.target.value })}
                      className="min-h-64 bg-muted font-mono text-xs"
                      spellCheck={false}
                    />
                    <div
                      className="min-h-64 overflow-y-auto rounded-lg border border-border bg-white p-4 text-black"
                      dangerouslySetInnerHTML={{
                        __html: sanitize(
                          draft.html_content.replace(/{{name}}/g, "Cliente Estimado"),
                        ),
                      }}
                    />
                  </div>
                </TabsContent>
              </Tabs>
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
