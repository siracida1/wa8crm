"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MousePointerClick, Send, UserX, Eye } from "lucide-react";

interface LogRow {
  id: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed";
  message_id: string | null;
  error: string | null;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  sent_at: string;
  unsubscribed: boolean;
}

interface Campaign {
  id: string;
  name: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
}

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/email/campaigns/${campaignId}/logs`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setCampaign(data.campaign);
          setLogs(data.logs ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [campaignId]);

  const openedCount = logs.filter((l) => l.opened_at).length;
  const clickedCount = logs.filter((l) => l.clicked_at).length;
  const unsubCount = logs.filter((l) => l.unsubscribed).length;

  return (
    <div>
      <Link
        href="/email/campaigns"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Campañas
      </Link>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !campaign ? (
        <p className="text-sm text-muted-foreground">No se encontró la campaña.</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-foreground">{campaign.name}</h2>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Send} label="Enviados" value={campaign.sent_count} />
            <Stat icon={Eye} label="Abrieron" value={openedCount} />
            <Stat icon={MousePointerClick} label="Hicieron clic" value={clickedCount} />
            <Stat icon={UserX} label="Se dieron de baja" value={unsubCount} />
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Destinatario</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Abierto</th>
                  <th className="px-3 py-2 font-medium">Clic</th>
                  <th className="px-3 py-2 font-medium">Baja</th>
                  <th className="px-3 py-2 font-medium">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2 text-foreground">{l.recipient}</td>
                    <td className="px-3 py-2">
                      {l.status === "sent" ? (
                        <span className="text-emerald-400">enviado</span>
                      ) : l.status === "failed" ? (
                        <span className="text-red-400" title={l.error ?? undefined}>
                          fallido
                        </span>
                      ) : (
                        <span className="text-muted-foreground">pendiente</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.opened_at
                        ? `Sí${l.open_count > 1 ? ` (${l.open_count})` : ""} · ${new Date(l.opened_at).toLocaleString()}`
                        : "No"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.clicked_at
                        ? `Sí${l.click_count > 1 ? ` (${l.click_count})` : ""} · ${new Date(l.clicked_at).toLocaleString()}`
                        : "No"}
                    </td>
                    <td className="px-3 py-2">
                      {l.unsubscribed ? (
                        <span className="text-amber-400">Sí</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(l.sent_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      Todavía no hay envíos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Send;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
