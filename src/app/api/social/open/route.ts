// ============================================================
// GET /api/social/open?section=launches
//
// Entry point for the Social media module. wacrm already knows who the
// caller is and which account (agency / subaccount) is active, so it:
//   1. looks up the Postiz user linked to that account (account_social);
//   2. if there is none and the caller is admin+, creates the Postiz
//      organization for the account and links it;
//   3. sets the Postiz `auth` cookie (shared on .zittex.com) for that
//      user and redirects to the embedded /social/<section> page.
// Clients therefore never need a separate Postiz login, and switching
// account in wacrm switches the Postiz organization.
// ============================================================

import { NextRequest, NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { hasMinRole } from "@/lib/auth/roles";
import { supabaseAdmin } from "@/lib/automations/admin-client";
import {
  POSTIZ_COOKIE_DOMAIN,
  createPostizOrg,
  findPostizUser,
  isPostizConfigured,
  signPostizJwt,
} from "@/lib/postiz";

const SECTIONS = new Set([
  "launches",
  "almanaque",
  "almanaque-2",
  "almanaque-3",
  "agents",
  "third-party",
  "analytics",
  "media",
  "plugs",
  "settings",
]);

function redirectTo(path: string): NextResponse {
  // Relative Location: behind the reverse proxy request.url may carry an
  // internal host/scheme, so never build an absolute URL from it.
  return new NextResponse(null, { status: 302, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("section") ?? "launches";
    const section = SECTIONS.has(raw) ? raw : "launches";
    const target = `/social/${section}`;

    if (!isPostizConfigured()) {
      return redirectTo(target); // fall back to whatever Postiz session exists
    }

    const ctx = await getCurrentAccount();
    const admin = supabaseAdmin();

    let { data: link } = await admin
      .from("account_social")
      .select("postiz_user_id")
      .eq("account_id", ctx.accountId)
      .maybeSingle();

    if (!link) {
      // Only admins provision; everyone else waits for an admin to open it.
      if (!hasMinRole(ctx.role, "admin")) {
        return redirectTo(target);
      }

      // Resumable: a previous attempt may have created the Postiz org but
      // failed before linking it, so look for it before creating anything.
      let found = await findPostizUser(ctx.accountId);
      if (!found) {
        // Postiz requires a unique email per synthetic user; it never mails
        // it (users are created activated). One address per account.
        await createPostizOrg(
          ctx.accountId,
          ctx.account.name,
          `${ctx.accountId}@accounts.zittex.com`,
        );
        found = await findPostizUser(ctx.accountId);
      }
      if (!found) {
        throw new Error("Postiz organization created but its user was not found");
      }

      const { error } = await admin.from("account_social").insert({
        account_id: ctx.accountId,
        postiz_user_id: found.userId,
        postiz_org_id: found.orgId,
      });
      if (error) throw error;
      link = { postiz_user_id: found.userId };
    }

    const res = redirectTo(target);
    res.cookies.set("auth", signPostizJwt({ id: link.postiz_user_id }), {
      domain: POSTIZ_COOKIE_DOMAIN,
      secure: true,
      httpOnly: true,
      sameSite: "none",
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    });
    // Drop any org pin from a previous session so Postiz picks this user's org.
    res.cookies.set("showorg", "", {
      domain: POSTIZ_COOKIE_DOMAIN,
      secure: true,
      httpOnly: true,
      sameSite: "none",
      expires: new Date(0),
    });
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
