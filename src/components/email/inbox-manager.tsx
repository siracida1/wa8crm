"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Inbox, Loader2, Send, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Thread {
  thread_key: string;
  sender_id: string;
  subject: string | null;
  counterpart: string;
  counterpart_name: string | null;
  last_message_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  thread_key: string;
  sender_id: string;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  direction: "inbound" | "outbound";
  received_at: string;
}

function sanitize(html: string) {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function InboxManager() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/inbox", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setThreads((data.threads as Thread[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const openThread = useCallback(async (thread: Thread) => {
    setActive(thread);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/email/inbox/thread?key=${encodeURIComponent(thread.thread_key)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setMessages((data.messages as Message[]) ?? []);
      if (thread.unread_count > 0) {
        await fetch("/api/email/inbox/thread", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_key: thread.thread_key }),
        });
        setThreads((prev) =>
          prev.map((t) => (t.thread_key === thread.thread_key ? { ...t, unread_count: 0 } : t)),
        );
      }
    } finally {
      setLoadingThread(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }, []);

  const sendReply = useCallback(async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: active.sender_id,
          thread_key: active.thread_key,
          to: active.counterpart,
          subject: active.subject ? `Re: ${active.subject}` : "Re:",
          html: `<p>${reply.replace(/\n/g, "<br/>")}</p>`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo enviar la respuesta.");
        return;
      }
      setReply("");
      await openThread(active);
    } catch {
      toast.error("No se pudo enviar la respuesta.");
    } finally {
      setSending(false);
    }
  }, [active, reply, openThread]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card">
        <div className="border-b border-border p-3">
          <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
          <p className="text-xs text-muted-foreground">Respuestas a tus campañas y secuencias.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : threads.length === 0 ? (
            <div className="p-6 text-center">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Sin mensajes todavía. Configurá IMAP en una cuenta de envío para recibir
                respuestas acá.
              </p>
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.thread_key}
                onClick={() => openThread(t)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                  active?.thread_key === t.thread_key ? "bg-primary/10" : ""
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {t.counterpart_name || t.counterpart}
                  </span>
                  {t.unread_count > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {t.unread_count}
                    </span>
                  )}
                </div>
                <span className="w-full truncate text-[11px] text-muted-foreground">
                  {t.subject || "(sin asunto)"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border border-border bg-card">
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Elegí una conversación
          </div>
        ) : (
          <>
            <div className="border-b border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {active.counterpart_name || active.counterpart}
              </p>
              <p className="text-xs text-muted-foreground">{active.counterpart}</p>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {loadingThread ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-lg border p-3 text-sm ${
                        m.direction === "outbound"
                          ? "ml-auto border-primary/30 bg-primary/10"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <User className="h-3 w-3" />
                        {m.direction === "outbound" ? "Vos" : m.from_name || m.from_email}
                        <span>· {new Date(m.received_at).toLocaleString()}</span>
                      </div>
                      {m.body_html ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitize(m.body_html) }} />
                      ) : (
                        <p className="whitespace-pre-wrap">{m.body_text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-end gap-2 border-t border-border p-3">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Escribí una respuesta..."
                className="min-h-16 flex-1"
              />
              <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
