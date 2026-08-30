"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { TOGGLE_LOCALES } from "@/i18n/locales";

const LABEL_KEY: Record<(typeof TOGGLE_LOCALES)[number], string> = {
  es: "spanish",
  en: "english",
};

/**
 * ES/EN segmented control — sets the `NEXT_LOCALE` cookie server-side
 * (src/app/api/locale) then refreshes the RSC tree so every server
 * component (and every client component reading useTranslations, via
 * NextIntlClientProvider's fresh `messages`) re-renders in the new
 * language. No route change, no page reload — the current screen and
 * its scroll position stay put.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("LanguageToggle");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingLocale, setPendingLocale] = useState<string | null>(null);

  const handleSelect = (next: string) => {
    if (next === locale || isPending) return;
    setPendingLocale(next);
    startTransition(async () => {
      try {
        await fetch("/api/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        });
      } finally {
        router.refresh();
        setPendingLocale(null);
      }
    });
  };

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5",
        className,
      )}
    >
      {TOGGLE_LOCALES.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => handleSelect(code)}
            disabled={isPending}
            aria-pressed={active}
            title={t(LABEL_KEY[code])}
            className={cn(
              "rounded-[5px] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors disabled:cursor-wait",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              pendingLocale === code && "opacity-60",
            )}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
