import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requirePermission } from "@/lib/auth";
import { findCatalogEntry, isCatalogEntryReady } from "@/lib/connector-catalog";
import {
  getOAuthCredentials,
  getOAuthProvider,
  getRedirectUri,
} from "@/lib/connector-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// OAuth callback. Vendor 302s the user here with ?code & ?state (or
// ?error). This route used to create the DataSource directly; now it
// returns a tiny HTML page that posts the tokens back to the opener
// window (the "Connect" dialog) via window.postMessage and closes
// itself. The opener decides what to do next (typically: populate the
// access-token field, let the user adjust advanced settings, then POST
// to /api/connections/from-catalog).
//
// Why a popup with postMessage instead of a full redirect:
//   - The user stays on the catalog page and never sees a vendor URL.
//   - The dialog can re-OAuth without leaving dead DataSource rows.
//   - One unified path works for both OAuth and pasted PAT inputs.

type CookiePayload = {
  state: string;
  codeVerifier: string;
  exp: number;
};

function makeCookieName(slug: string): string {
  return `mcpgw_oauth_${slug.replace(/[^a-z0-9-]/gi, "_")}`;
}

// Render an HTML page that posts a message to the opener and closes.
// Payload is JSON-encoded twice (once into a JS string literal, once
// when the opener JSON.parses it) — the JS-string escape prevents any
// vendor field with quotes from breaking out of the literal.
function postMessageHtml(message: Record<string, unknown>): string {
  const json = JSON.stringify(message).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><title>Authentication</title></head>
<body style="font-family:system-ui;color:#888;background:#0b0b0c;text-align:center;padding:32px;">
<p>Finishing sign-in…</p>
<script>
(function () {
  var payload = ${JSON.stringify(json)};
  try {
    if (window.opener) {
      window.opener.postMessage(JSON.parse(payload), window.location.origin);
    }
  } catch (e) {}
  setTimeout(function () { window.close(); }, 50);
})();
</script>
</body></html>`;
}

function htmlResponse(body: string, status = 200): Response {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePermission("connections.create");
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const entry = findCatalogEntry(slug);
  if (!entry || !isCatalogEntryReady(entry) || entry.auth?.kind !== "oauth") {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "unknown_connector" }),
    );
  }

  const url = new URL(request.url);
  const vendorError = url.searchParams.get("error");
  if (vendorError) {
    return htmlResponse(
      postMessageHtml({
        type: "mcpgw-oauth-error",
        slug,
        error: `vendor_returned_${vendorError}`,
      }),
    );
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "missing_code_or_state" }),
    );
  }

  const cookieJar = await cookies();
  const cookieName = makeCookieName(slug);
  const cookie = cookieJar.get(cookieName);
  cookieJar.delete(cookieName);
  if (!cookie) {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "session_expired" }),
    );
  }
  let payload: CookiePayload;
  try {
    payload = JSON.parse(cookie.value) as CookiePayload;
  } catch {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "bad_cookie" }),
    );
  }
  if (payload.exp < Date.now()) {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "session_expired" }),
    );
  }
  if (payload.state !== state) {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "state_mismatch" }),
    );
  }

  const providerKey = entry.auth.provider;
  const provider = getOAuthProvider(providerKey);
  const creds = getOAuthCredentials(providerKey);
  if (!provider || !creds) {
    return htmlResponse(
      postMessageHtml({ type: "mcpgw-oauth-error", slug, error: "oauth_not_configured" }),
    );
  }

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
    return htmlResponse(
      postMessageHtml({
        type: "mcpgw-oauth-error",
        slug,
        error: `token_exchange_${tokenRes.status}`,
      }),
    );
  }
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    api_domain?: string; // Zoho
    instance_url?: string; // Salesforce
  };
  if (!tokenData.access_token) {
    return htmlResponse(
      postMessageHtml({
        type: "mcpgw-oauth-error",
        slug,
        error: "no_access_token_in_response",
      }),
    );
  }

  // Vendor-specific extras the dialog may want to stash in advanced
  // settings on submit (e.g. Salesforce's instance_url is required by
  // the adapter — the dialog forwards it back in the from-catalog body).
  const extra: Record<string, string> = {};
  if (tokenData.api_domain) extra.apiDomain = tokenData.api_domain;
  if (tokenData.instance_url) extra.instanceUrl = tokenData.instance_url;

  return htmlResponse(
    postMessageHtml({
      type: "mcpgw-oauth-result",
      slug,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      extra,
    }),
  );
}
