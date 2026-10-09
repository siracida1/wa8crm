import { notFound } from "next/navigation";

// Social media module: Postiz (post.zittex.com) embedded as an iframe so
// it lives inside the same sidebar as WhatsApp and Email Marketing.
// Postiz sends no X-Frame-Options / frame-ancestors header, and both apps
// are on *.zittex.com (same site), so its session cookie works in the frame.
const POSTIZ_URL = "https://post.zittex.com";

// Whitelist: only these Postiz routes are reachable through /social/<key>.
const SECTIONS: Record<string, string> = {
  launches: "/launches",
  analytics: "/analytics",
  media: "/media",
  plugs: "/plugs",
  settings: "/settings",
};

export default async function SocialSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const path = SECTIONS[section];
  if (!path) notFound();

  return (
    <iframe
      src={`${POSTIZ_URL}${path}`}
      title="Postiz"
      className="w-full rounded-lg border border-border bg-background"
      style={{ height: "calc(100vh - 7.5rem)" }}
      allow="clipboard-write; fullscreen"
    />
  );
}
