import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { findCatalogEntry, isCatalogEntryReady } from "@/lib/connector-catalog";
import {
  getOAuthCredentials,
  getOAuthProvider,
  getRedirectUri,
} from "@/lib/connector-oauth";
import type { EncryptedConfig } from "@/lib/mcp/upstream-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OAuth callback. Vendor 302s the user here with ?code & ?state (or
// ?error). We:
//   1. require admin auth (cookie still valid, same admin who started)
//   2. read the matching mcpgw_oauth_<slug> cookie -> verifier + expected state
//   3. exchange the code for tokens
//   4. build EncryptedConfig with the OAuth blob
//   5. create a new DataSource and redirect to its detail page

type CookiePayload = {
  state: string;
  codeVerifier: string;
  exp: number;
};

function makeCookieName(slug: string): string {
  return `mcpgw_oauth_${slug.replace(/[^a-z0-9-]/gi, "_")}`;
}

function uniqueSlugBase(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "connection"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  if (!(await prisma.dataSource.findUnique({ where: { slug: base } }))) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}-${n}`;
    if (!(await prisma.dataSource.findUnique({ where: { slug: candidate } }))) return candidate;
    n++;
    if (n > 999) throw new Error("Couldn't find a free slug after 999 attempts");
  }
}

function errorRedirect(slug: string, msg: string): NextResponse {
  const target = new URL(`/connections/new/catalog/${slug}`, process.env.OIDC_ISSUER!);
  target.searchParams.set("error", msg);
  return NextResponse.redirect(target.toString(), { status: 302 });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const entry = findCatalogEntry(slug);
  if (!entry || !isCatalogEntryReady(entry) || entry.auth?.kind !== "oauth") {
    return NextResponse.json({ error: "unknown_connector" }, { status: 404 });
  }

  const url = new URL(request.url);
  const vendorError = url.searchParams.get("error");
  if (vendorError) {
    return errorRedirect(slug, `vendor_returned_${vendorError}`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return errorRedirect(slug, "missing_code_or_state");
  }

  const cookieJar = await cookies();
  const cookieName = makeCookieName(slug);
  const cookie = cookieJar.get(cookieName);
  cookieJar.delete(cookieName);
  if (!cookie) return errorRedirect(slug, "session_expired");
  let payload: CookiePayload;
  try {
    payload = JSON.parse(cookie.value) as CookiePayload;
  } catch {
    return errorRedirect(slug, "bad_cookie");
  }
  if (payload.exp < Date.now()) return errorRedirect(slug, "session_expired");
  if (payload.state !== state) return errorRedirect(slug, "state_mismatch");

  const providerKey = entry.auth.provider;
  const provider = getOAuthProvider(providerKey);
  const creds = getOAuthCredentials(providerKey);
  if (!provider || !creds) return errorRedirect(slug, "oauth_not_configured");

  const redirectUri = getRedirectUri(slug);
  const tokenRes = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code_verifier: payload.codeVerifier,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    console.error(`[oauth/${slug}] token exchange failed`, tokenRes.status, text.slice(0, 500));
    return errorRedirect(slug, `token_exchange_${tokenRes.status}`);
  }
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    api_domain?: string; // Zoho returns this — vendor-specific API base
    instance_url?: string; // Salesforce returns this
  };
  if (!tokenData.access_token) {
    return errorRedirect(slug, "no_access_token_in_response");
  }

  // What does upstreamUrl point at?
  //   saas-remote-mcp -> the vendor's remote MCP endpoint (from the catalog).
  //                      For Salesforce we override with the per-org
  //                      instance_url since each org has its own host.
  //   saas-adapter    -> our own /api/upstream-mcp/<adapter>/<connectorId>
  //                      route. We don't know connectorId yet — so we
  //                      create the row first with a placeholder, then
  //                      patch the URL once we have the ID.
  const extra: Record<string, string> = {};
  if (tokenData.api_domain) extra.apiDomain = tokenData.api_domain;
  if (tokenData.instance_url) extra.instanceUrl = tokenData.instance_url;

  const cfg: EncryptedConfig = {
    authScheme: "oauth",
    oauth: {
      providerKey,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt:
        tokenData.expires_in !== undefined
          ? Date.now() + tokenData.expires_in * 1000
          : undefined,
    },
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };

  // Figure out the initial upstreamUrl. For Salesforce we use the org's
  // instance_url + /mcp (their official endpoint); for others we use
  // whatever the catalog said. For saas-adapter we set a placeholder and
  // patch it post-insert.
  let upstreamUrl: string;
  if (entry.kind === "saas-adapter") {
    upstreamUrl = "about:adapter-placeholder";
  } else if (entry.slug === "salesforce" && tokenData.instance_url) {
    upstreamUrl = `${tokenData.instance_url.replace(/\/$/, "")}/services/data/mcp`;
  } else if (entry.remoteMcpUrl) {
    upstreamUrl = entry.remoteMcpUrl;
  } else {
    return errorRedirect(slug, "no_upstream_url_for_entry");
  }

  const baseSlug = await uniqueSlug(uniqueSlugBase(entry.name));
  const configEncrypted = await encryptJson(cfg);

  let created;
  try {
    created = await prisma.dataSource.create({
      data: {
        name: entry.name,
        slug: baseSlug,
        type: entry.type,
        upstreamUrl,
        description: entry.description,
        configEncrypted,
      },
    });
  } catch (err) {
    console.error(`[oauth/${slug}] dataSource.create failed`, err);
    return errorRedirect(slug, "create_failed");
  }

  // Now that we have the row ID, patch the upstreamUrl for adapter-backed
  // connectors so the proxy routes back to our own adapter.
  if (entry.kind === "saas-adapter" && entry.adapter) {
    const adapterUrl = `${process.env.OIDC_ISSUER}/api/upstream-mcp/${entry.adapter}/${created.id}`;
    await prisma.dataSource.update({
      where: { id: created.id },
      data: { upstreamUrl: adapterUrl },
    });
  }

  return NextResponse.redirect(
    new URL(`/connections/${created.id}`, process.env.OIDC_ISSUER!).toString(),
    { status: 302 },
  );
}
