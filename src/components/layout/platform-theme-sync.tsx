"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/hooks/use-theme";

// Forces the Email Marketing module (everything under /email) to always
// render in its fixed violet identity, no matter what accent color the
// user picked for the WhatsApp side in Settings — the two platforms need
// to stay visually unmistakable from each other. Restores the user's own
// theme the moment they navigate back out of /email.
export function PlatformThemeSync() {
  const pathname = usePathname();
  const { theme } = useTheme();

  useEffect(() => {
    const isEmailPlatform = pathname.startsWith("/email");
    document.documentElement.dataset.theme = isEmailPlatform ? "violet" : theme;
    return () => {
      document.documentElement.dataset.theme = theme;
    };
  }, [pathname, theme]);

  return null;
}
