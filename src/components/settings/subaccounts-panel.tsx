"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, ExternalLink, Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Agency -> subaccounts admin (migrations 054 + 055). Everything goes
// through SECURITY DEFINER RPCs that re-check the caller's access, so the
// UI only needs to surface their errors.
type MemberRole = "admin" | "agent" | "viewer";

interface MyAccount {
  id: string;
  name: string;
  parent_account_id: string | null;
  role: string;
  is_active: boolean;
}

interface Member {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_owner: boolean;
}

const ROLES: MemberRole[] = ["admin", "agent", "viewer"];

export function SubaccountsPanel() {
  const t = useTranslations("Subaccounts");
  const [accounts, setAccounts] = useState<MyAccount[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("list_my_accounts");
    if (err) {
      setError(err.message);
      setAccounts([]);
      return;
    }
    setAccounts((data ?? []) as MyAccount[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = accounts?.find((a) => a.is_active) ?? null;
  const isAgency = !!active && !active.parent_account_id;
  const parent = active?.parent_account_id
    ? (accounts ?? []).find((a) => a.id === active.parent_account_id) ?? null
    : null;
  const canManage =
    isAgency && (active?.role === "owner" || active?.role === "admin");
  const children = (accounts ?? []).filter(
    (a) => active && a.parent_account_id === active.id,
  );

  async function createSubaccount(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("create_subaccount", {
      subaccount_name: name.trim(),
      parent_id: active.id,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setName("");
    await load();
  }

  async function open(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("switch_account", {
      target_account_id: id,
    });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    window.location.assign("/dashboard");
  }

  if (accounts === null) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("desc")}</p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!isAgency ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span className="flex-1">{t("switchToAgency")}</span>
          {parent ? (
            <Button size="sm" onClick={() => open(parent.id)} disabled={busy}>
              {t("openAgency", { name: parent.name })}
            </Button>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <form onSubmit={createSubaccount} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={80}
          />
          <Button type="submit" disabled={busy || !name.trim()}>
            {t("create")}
          </Button>
        </form>
      ) : null}

      {isAgency && children.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : null}

      <div className="space-y-4">
        {children.map((acc) => (
          <SubaccountCard
            key={acc.id}
            account={acc}
            onOpen={() => open(acc.id)}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

function SubaccountCard({
  account,
  onOpen,
  onError,
}: {
  account: MyAccount;
  onOpen: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("Subaccounts");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("agent");

  const loadMembers = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_account_members", {
      target_account_id: account.id,
    });
    if (error) {
      onError(error.message);
      setMembers([]);
      return;
    }
    setMembers((data ?? []) as Member[]);
  }, [account.id, onError]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    onError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("add_account_member_by_email", {
      target_account_id: account.id,
      member_email: email.trim(),
      member_role: role,
    });
    if (error) {
      onError(error.message);
      return;
    }
    setEmail("");
    await loadMembers();
  }

  async function changeRole(userId: string, next: MemberRole) {
    onError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_account_membership", {
      target_user_id: userId,
      target_account_id: account.id,
      new_role: next,
    });
    if (error) onError(error.message);
    await loadMembers();
  }

  async function remove(userId: string) {
    onError(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_account_membership", {
      target_user_id: userId,
      target_account_id: account.id,
    });
    if (error) onError(error.message);
    await loadMembers();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 truncate font-medium text-foreground">
          {account.name}
        </span>
        <Button variant="outline" size="sm" onClick={onOpen}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          {t("open")}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("members")}
        </p>
        {members === null ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.full_name || m.email}
                  </p>
                  {m.full_name ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </p>
                  ) : null}
                </div>
                {m.is_owner ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    {t("roleOwner")}
                  </span>
                ) : (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        changeRole(m.user_id, e.target.value as MemberRole)
                      }
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      aria-label={t("role")}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role_${r}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(m.user_id)}
                      aria-label={t("remove")}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex flex-wrap items-center gap-2 pt-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            className="min-w-48 flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            className="rounded-md border border-border bg-background px-2 py-2 text-sm"
            aria-label={t("role")}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role_${r}`)}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={!email.trim()}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t("add")}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">{t("addHint")}</p>
      </div>
    </div>
  );
}
