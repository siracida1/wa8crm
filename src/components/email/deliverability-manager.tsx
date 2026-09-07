"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CheckResult {
  found: boolean;
  record?: string;
  issues: string[];
}
interface DkimResult extends CheckResult {
  selectorsFound: string[];
}
interface Report {
  domain: string;
  spf: CheckResult;
  dkim: DkimResult;
  dmarc: CheckResult;
}
interface Sender {
  id: string;
  email: string;
}

export function DeliverabilityManager() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [domain, setDomain] = useState("");
  const [selector, setSelector] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/email/senders");
      const data = await res.json().catch(() => ({}));
      const list: Sender[] = data.senders ?? [];
      setSenders(list);
      const firstDomain = list[0]?.email.split("@")[1];
      if (firstDomain) setDomain(firstDomain);
    })();
  }, []);

  const check = useCallback(async () => {
    if (!domain.trim()) {
      toast.error("Ingresá un dominio.");
      return;
    }
    setLoading(true);
    setReport(null);
    try {
      const params = new URLSearchParams({ domain: domain.trim() });
      if (selector.trim()) params.set("selector", selector.trim());
      const res = await fetch(`/api/email/deliverability?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo chequear el dominio.");
        return;
      }
      setReport(data.report);
    } finally {
      setLoading(false);
    }
  }, [domain, selector]);

  const domainOptions = Array.from(new Set(senders.map((s) => s.email.split("@")[1])));

  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Entregabilidad</h2>
        <p className="text-sm text-muted-foreground">
          Chequeá si el dominio de tus cuentas de envío tiene SPF, DKIM y DMARC bien
          configurados — la causa más común de que las campañas caigan en spam.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="min-w-48">
          <Label className="mb-1 block text-xs text-muted-foreground">Dominio</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="zittex.com"
            list="sender-domains"
          />
          <datalist id="sender-domains">
            {domainOptions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div className="min-w-40">
          <Label className="mb-1 block text-xs text-muted-foreground">
            Selector DKIM (opcional)
          </Label>
          <Input
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="ej: default"
          />
        </div>
        <Button onClick={check} disabled={loading}>
          {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          <ShieldCheck className="mr-1 h-4 w-4" />
          Chequear
        </Button>
      </div>

      {report && (
        <div className="mt-6 flex flex-col gap-3">
          <CheckCard title="SPF" domain={report.domain} result={report.spf} />
          <CheckCard
            title="DKIM"
            domain={report.domain}
            result={report.dkim}
            extra={
              report.dkim.selectorsFound.length > 0
                ? `Selector(es) encontrado(s): ${report.dkim.selectorsFound.join(", ")}`
                : undefined
            }
          />
          <CheckCard title="DMARC" domain={report.domain} result={report.dmarc} />
        </div>
      )}
    </div>
  );
}

function CheckCard({
  title,
  domain,
  result,
  extra,
}: {
  title: string;
  domain: string;
  result: CheckResult;
  extra?: string;
}) {
  const ok = result.found && result.issues.length === 0;
  const warn = result.found && result.issues.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : warn ? (
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <span className="text-xs text-muted-foreground">{domain}</span>
      </div>
      {extra && <p className="mt-1 text-xs text-muted-foreground">{extra}</p>}
      {result.record && (
        <p className="mt-2 truncate rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {result.record}
        </p>
      )}
      {result.issues.map((issue, i) => (
        <p key={i} className="mt-2 text-xs text-amber-300">
          {issue}
        </p>
      ))}
      {ok && <p className="mt-2 text-xs text-emerald-400">Todo en orden.</p>}
    </div>
  );
}
