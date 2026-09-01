"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mail, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// Two isolated platforms live in this one app: the WhatsApp CRM and the
// Email Marketing module (EMKT Zittex). Each keeps its own fixed brand
// color (green / violet) regardless of the user's personal accent-theme
// choice in Settings — see PlatformThemeSync, which enforces that. This
// switcher is the only place the two cross over: pick one, the sidebar
// and color scheme fully switch to match.
const PLATFORMS = [
  {
    id: "whatsapp" as const,
    href: "/dashboard",
    labelKey: "platformWhatsapp",
    icon: MessageSquare,
    activeClass:
      "border-[oklch(0.761_0.201_149.7)]/40 bg-[oklch(0.761_0.201_149.7)]/12 text-[oklch(0.6_0.16_149.7)] dark:text-[oklch(0.761_0.201_149.7)]",
  },
  {
    id: "email" as const,
    href: "/email",
    labelKey: "platformEmail",
    icon: Mail,
    activeClass:
      "border-[oklch(0.526_0.247_293)]/40 bg-[oklch(0.526_0.247_293)]/12 text-[oklch(0.526_0.247_293)]",
  },
];

export function PlatformSwitcher() {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const activePlatform = pathname.startsWith("/email") ? "email" : "whatsapp";

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {PLATFORMS.map((platform) => {
        const isActive = platform.id === activePlatform;
        return (
          <Link
            key={platform.id}
            href={platform.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? platform.activeClass
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <platform.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t(platform.labelKey)}</span>
          </Link>
        );
      })}
    </div>
  );
}
