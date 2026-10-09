import { notFound } from "next/navigation";

// Social media module: Postiz (post.zittex.com) embedded as an iframe so
// it lives inside the same sidebar as WhatsApp and Email Marketing.
// Postiz sends no X-Frame-Options / frame-ancestors header, and both apps
// are on *.zittex.com (same site), so its session cookie works in the frame.
const POSTIZ_URL = "https://post.zittex.com";

// Whitelist: only these Postiz routes are reachable through /social/<key>.
const SECTIONS: Record<string, string> = {
  launches: "/launches",
  almanaque: "/almanaque",
  "almanaque-2": "/almanaque-2",
  "almanaque-3": "/almanaque-3",
  agents: "/agents",
  "third-party": "/third-party",
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

  // Postiz draws its own left menu (12px margin + 80px bar + 8px gap). The
  // sections are already in wacrm's sidebar, so on large screens the frame is
  // shifted left to crop that strip. Postiz's mobile layout is left intact.
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-background"
      style={{ height: "calc(100vh - 7.5rem)" }}
    >
      <iframe
        src={`${POSTIZ_URL}${path}`}
        title="Postiz"
        className="h-full w-full border-0 lg:-ml-[100px] lg:w-[calc(100%+100px)]"
        allow="clipboard-write; fullscreen"
      />
    </div>
  );
}
