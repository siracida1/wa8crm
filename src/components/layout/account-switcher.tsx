"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Agency -> subaccounts switcher (migration 054). The RPCs resolve access
// (membership, agency inheritance or super admin); switching just moves the
// user's active account, so every page keeps reading profiles.account_id.
interface MyAccount {
  id: string;
  name: string;
  parent_account_id: string | null;
  role: string;
  is_active: boolean;
}

export function AccountSwitcher() {
  const t = useTranslations("Sidebar");
  const router = useRouter();
  const { accountId } = useAuth();
  const [accounts, setAccounts] = useState<MyAccount[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_my_accounts");
    if (!error && data) setAccounts(data as MyAccount[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load, accountId]);

  const active = accounts.find((a) => a.is_active);
  // Only a root (agency) account's owner/admin can create subaccounts.
  const canCreate =
    !!active &&
    !active.parent_account_id &&
    (active.role === "owner" || active.role === "admin");

  // Nothing to show for a solo user who can't create subaccounts.
  if (accounts.length <= 1 && !canCreate) return null;

  async function switchTo(id: string) {
    if (busy || id === active?.id) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("switch_account", {
      target_account_id: id,
    });
    if (error) {
      setBusy(false);
      console.error("switch_account failed", error.message);
      return;
    }
    // Full reload so every context (auth, realtime, caches) re-reads the
    // new active account.
    window.location.assign("/dashboard");
  }

  // Creation + member management live in Settings -> Subaccounts & access.
  function goToSubaccounts() {
    router.push("/settings?tab=subaccounts");
  }

  const roots = accounts.filter((a) => !a.parent_account_id);

  return (
    <div className="shrink-0 border-b border-border px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus:outline-none disabled:opacity-60"
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {active?.name ?? t("switchAccount")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="min-w-56 bg-popover text-popover-foreground ring-border"
        >
          {roots.map((root) => (
            <div key={root.id}>
              <AccountRow account={root} onPick={switchTo} />
              {accounts
                .filter((a) => a.parent_account_id === root.id)
                .map((child) => (
                  <AccountRow
                    key={child.id}
                    account={child}
                    onPick={switchTo}
                    nested
                  />
                ))}
            </div>
          ))}
          {/* Subaccounts whose agency the user can't see (direct membership). */}
          {accounts
            .filter(
              (a) =>
                a.parent_account_id &&
                !roots.some((r) => r.id === a.parent_account_id),
            )
            .map((orphan) => (
              <AccountRow key={orphan.id} account={orphan} onPick={switchTo} />
            ))}
          {canCreate ? (
            <>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={goToSubaccounts}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <Plus className="size-4" />
                {t("newSubaccount")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AccountRow({
  account,
  onPick,
  nested = false,
}: {
  account: MyAccount;
  onPick: (id: string) => void;
  nested?: boolean;
}) {
  return (
    <DropdownMenuItem
      onClick={() => onPick(account.id)}
      className={cn(
        "text-popover-foreground focus:bg-accent focus:text-accent-foreground",
        nested && "pl-7",
      )}
    >
      <span className="flex-1 truncate">{account.name}</span>
      {account.is_active ? <Check className="size-4 text-primary" /> : null}
    </DropdownMenuItem>
  );
}
