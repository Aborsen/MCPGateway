// Per-vendor OAuth client configuration for the "Create connection" flow.
// Each vendor needs an OAuth app registered in their developer console; we
// read the client_id / client_secret from env vars rather than hard-coding
// or storing in DB so secrets stay out of source control + Prisma.
//
// Env-var pattern: CONNECTOR_OAUTH_<SLUG_UPPER>_CLIENT_ID / _CLIENT_SECRET
// where <SLUG_UPPER> is the catalog slug with hyphens turned into
// underscores and uppercased. So `zoho-crm` -> ZOHO_CRM.

import type { CatalogEntry } from "./connector-catalog";

export type OAuthProviderConfig = {
  // Authorization endpoint (where we send the user to log in).
  authorizeUrl: string;
  // Token endpoint (where we exchange the code for tokens).
  tokenUrl: string;
  // Space-separated scope string the gateway requests on the user's behalf.
  scopes: string;
  // Optional extra params appended to the authorize URL (e.g. Salesforce
  // wants `prompt=login`, Zoho wants `access_type=offline`).
  extraAuthorizeParams?: Record<string, string>;
  // Some vendors require the redirect_uri to also be sent on the token
  // exchange, others reject it. Default true; flip per-vendor if needed.
  sendRedirectUriOnTokenExchange?: boolean;
};

// Provider table. Keyed by `auth.provider` from the catalog, NOT the slug
// — this way two catalog entries can share an OAuth provider (e.g. Google
// Drive + Sheets sharing one Google OAuth app, if we ever add them).
const PROVIDERS: Record<string, OAuthProviderConfig> = {
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes:
      "oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read",
  },
  salesforce: {
    // Production org. For sandboxes, the admin would need to set
    // CONNECTOR_OAUTH_SALESFORCE_AUTHORIZE_URL to test.salesforce.com.
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: "api refresh_token offline_access",
    extraAuthorizeParams: { prompt: "login" },
  },
  supabase: {
    authorizeUrl: "https://api.supabase.com/v1/oauth/authorize",
    tokenUrl: "https://api.supabase.com/v1/oauth/token",
    scopes: "all",
  },
  "zoho-crm": {
    // Zoho regional domains differ per account (.com, .eu, .in, ...). We
    // default to .com; admins on other regions set
    // CONNECTOR_OAUTH_ZOHO_CRM_AUTHORIZE_URL / _TOKEN_URL explicitly.
    authorizeUrl: "https://accounts.zoho.com/oauth/v2/auth",
    tokenUrl: "https://accounts.zoho.com/oauth/v2/token",
    scopes: "ZohoCRM.modules.ALL ZohoCRM.settings.READ",
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  },
};

export function getOAuthProvider(providerKey: string): OAuthProviderConfig | undefined {
  const base = PROVIDERS[providerKey];
  if (!base) return undefined;
  // Allow per-deploy override of the URLs (mainly for Salesforce sandboxes
  // and Zoho regional domains).
  const upper = providerKey.replace(/-/g, "_").toUpperCase();
  return {
    ...base,
    authorizeUrl: process.env[`CONNECTOR_OAUTH_${upper}_AUTHORIZE_URL`] ?? base.authorizeUrl,
    tokenUrl: process.env[`CONNECTOR_OAUTH_${upper}_TOKEN_URL`] ?? base.tokenUrl,
    scopes: process.env[`CONNECTOR_OAUTH_${upper}_SCOPES`] ?? base.scopes,
  };
}

export type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export function getOAuthCredentials(providerKey: string): OAuthCredentials | undefined {
  const upper = providerKey.replace(/-/g, "_").toUpperCase();
  const clientId = process.env[`CONNECTOR_OAUTH_${upper}_CLIENT_ID`];
  const clientSecret = process.env[`CONNECTOR_OAUTH_${upper}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret };
}

// Resolved redirect URI for this deploy. Same shape for every vendor, only
// the {slug} differs. Vendor OAuth apps must whitelist this URL.
export function getRedirectUri(slug: string): string {
  const origin = process.env.OIDC_ISSUER;
  if (!origin) throw new Error("OIDC_ISSUER is not set; cannot build OAuth redirect URI");
  return `${origin}/api/connections/oauth/${slug}/callback`;
}

// Helper for the catalog UI: is the deploy configured to actually finish
// the OAuth dance for this entry? (i.e. are client_id/secret present.)
export function isOAuthEntryConfigured(entry: CatalogEntry): boolean {
  if (!entry.auth || entry.auth.kind !== "oauth") return true;
  return getOAuthCredentials(entry.auth.provider) !== undefined;
}
