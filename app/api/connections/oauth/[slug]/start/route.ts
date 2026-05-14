import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { findCatalogEntry, isCatalogEntryReady } from "@/lib/connector-catalog";
import {
  getOAuthCredentials,
  getOAuthProvider,
  getRedirectUri,
} from "@/lib/connector-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kicks off PKCE OAuth against the configured upstream vendor. We do the
// PKCE dance ourselves rather than relying on a library so the existing
// `oidc-provider` setup (which auths Claude Code into MCP Gateway itself)
// stays untouched. The two flows live on completely separate routes.
//
// Cookie: we stash {slug, state, codeVerifier} in an HttpOnly+SameSite=Lax
// cookie keyed by slug. The vendor 302s the browser back to /callback
// where we re-read this cookie, verify state, and finish the exchange.
//
// CSRF: the state value lives in the cookie AND in the redirect; the
// callback rejects mismatches. SameSite=Lax already protects against
// cross-origin form submissions to /callback.

type CookiePayload = {
  state: string;
  codeVerifier: string;
  exp: number;
};

function makeCookieName(slug: string): string {
  // Keep them per-slug so admins can run two parallel OAuth flows for
  // different connectors without one cookie clobbering the other.
  return `mcpgw_oauth_${slug.replace(/[^a-z0-9-]/gi, "_")}`;
}

function genVerifier(): string {
  // RFC 7636: 43-128 chars, [A-Z / a-z / 0-9 / "-" / "." / "_" / "~"].
  // 32 bytes -> 43 base64url chars without padding.
  return crypto.randomBytes(32).toString("base64url");
}

function challengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const entry = findCatalogEntry(slug);
  if (!entry || !isCatalogEntryReady(entry)) {
    return NextResponse.json({ error: "unknown_connector" }, { status: 404 });
  }
  if (entry.auth?.kind !== "oauth") {
    return NextResponse.json({ error: "not_an_oauth_connector" }, { status: 400 });
  }
  const providerKey = entry.auth.provider;
  const provider = getOAuthProvider(providerKey);
  const creds = getOAuthCredentials(providerKey);
  if (!provider || !creds) {
    return NextResponse.json(
      { error: "oauth_not_configured", provider: providerKey },
      { status: 500 },
    );
  }

  const state = crypto.randomBytes(16).toString("base64url");
  const codeVerifier = genVerifier();
  const codeChallenge = challengeFor(codeVerifier);

  const payload: CookiePayload = {
    state,
    codeVerifier,
    exp: Date.now() + 10 * 60_000, // 10-minute window to complete the dance
  };
  const cookieJar = await cookies();
  cookieJar.set(makeCookieName(slug), JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/connections/oauth",
    maxAge: 10 * 60,
  });

  const redirectUri = getRedirectUri(slug);
  const authorizeUrl = new URL(provider.authorizeUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", creds.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", provider.scopes);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(provider.extraAuthorizeParams ?? {})) {
    authorizeUrl.searchParams.set(k, v);
  }

  return NextResponse.redirect(authorizeUrl.toString(), { status: 302 });
}
