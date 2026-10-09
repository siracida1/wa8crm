import { createHmac } from "crypto";

// Postiz (post.zittex.com) integration helpers — server only.
//
// Postiz authenticates with an HS256 JWT ({ id: <user id> }) signed with its
// JWT_SECRET, sent in the `auth` cookie/header. wacrm checks the caller's
// access to a wacrm account first, then mints the session for the Postiz
// user linked to that account (table `account_social`).

export const POSTIZ_URL = process.env.POSTIZ_URL ?? "https://post.zittex.com";
// Cookie domain Postiz itself uses (registrable domain of its FRONTEND_URL).
export const POSTIZ_COOKIE_DOMAIN =
  process.env.POSTIZ_COOKIE_DOMAIN ?? ".zittex.com";

export function isPostizConfigured(): boolean {
  return !!process.env.POSTIZ_JWT_SECRET && !!process.env.POSTIZ_ADMIN_USER_ID;
}

const b64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

export function signPostizJwt(payload: Record<string, unknown>): string {
  const secret = process.env.POSTIZ_JWT_SECRET;
  if (!secret) throw new Error("POSTIZ_JWT_SECRET is not set");
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }),
  );
  const sig = b64url(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

interface PostizOrg {
  id: string;
  apiKey?: string;
}

/**
 * Create a Postiz organization (+ its owner user) for a wacrm account via
 * Postiz's JWT-gated /enterprise/create-user. The synthetic user's name is
 * `${name}###${accountId}`, which is how we find its id afterwards.
 */
export async function createPostizOrg(
  accountId: string,
  name: string,
  email: string,
): Promise<PostizOrg> {
  const params = signPostizJwt({
    id: accountId,
    name,
    saasName: "zittex",
    email,
  });
  const res = await fetch(`${POSTIZ_URL}/api/enterprise/create-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ params }),
  });
  const data = (await res.json().catch(() => null)) as
    | (PostizOrg & { create?: boolean; success?: boolean })
    | null;
  if (!res.ok || !data || !data.id) {
    throw new Error("Postiz did not create the organization");
  }
  return { id: data.id, apiKey: data.apiKey };
}

interface PostizUserOrgRow {
  organization?: { id: string; deletedAt?: string | null } | null;
  user?: { id: string; name?: string | null; deletedAt?: string | null } | null;
}

/**
 * Find the synthetic Postiz user/org created for an account (super admin
 * search). Postiz returns UserOrganization rows ({ organization, user }).
 */
export async function findPostizUser(
  accountId: string,
): Promise<{ userId: string; orgId: string | null } | null> {
  const adminToken = signPostizJwt({ id: process.env.POSTIZ_ADMIN_USER_ID });
  const res = await fetch(
    `${POSTIZ_URL}/api/user/impersonate?name=${encodeURIComponent(accountId)}`,
    { headers: { auth: adminToken } },
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as PostizUserOrgRow[];
  const match = (Array.isArray(rows) ? rows : []).find(
    (r) => r.user?.name?.endsWith(`###${accountId}`) && !r.user?.deletedAt,
  );
  if (!match?.user) return null;
  return { userId: match.user.id, orgId: match.organization?.id ?? null };
}
