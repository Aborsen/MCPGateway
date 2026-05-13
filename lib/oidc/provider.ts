import Provider from "oidc-provider";
import { prisma } from "@/lib/db";
import { PrismaAdapter } from "./adapter";
import { loadJwks } from "./jwks";

// The configured oidc-provider instance. Singleton: built lazily on first use
// so missing env vars during build (e.g. Vercel pre-deploy) don't break.

function readEnv() {
  const issuer = process.env.OIDC_ISSUER;
  const cookieKey = process.env.OIDC_COOKIE_KEY;
  if (!issuer) throw new Error("OIDC_ISSUER is not set");
  if (!cookieKey) throw new Error("OIDC_COOKIE_KEY is not set");
  return { issuer, cookieKey };
}

export function getMcpResourceUrl(): string {
  return `${readEnv().issuer}/api/mcp`;
}

function buildProvider(): Provider {
  const { issuer, cookieKey } = readEnv();
  const resourceBase = `${issuer}/api/mcp`;
  return new Provider(issuer, {
  adapter: PrismaAdapter,
  jwks: loadJwks(),
  pkce: { required: () => true },
  clientBasedCORS: () => true,
  scopes: ["openid", "mcp", "offline_access"],
  features: {
    devInteractions: { enabled: false },
    registration: {
      enabled: true,
      idFactory: () => `c_${cryptoRandomId()}`,
    },
    resourceIndicators: {
      enabled: true,
      defaultResource: () => resourceBase,
      useGrantedResource: () => true,
      getResourceServerInfo: () => ({
        scope: "mcp",
        // Opaque access tokens (default). The resource server is the same
        // process as the AS, so we validate via provider.AccessToken.find
        // — no need to issue JWTs the client can introspect itself.
        accessTokenTTL: 60 * 60,
        audience: resourceBase,
      }),
    },
    userinfo: { enabled: true },
  },
  rotateRefreshToken: true,
  issueRefreshToken: async (_ctx, client) => {
    // Public clients (Claude) with PKCE get refresh tokens. Default behavior
    // would only issue with offline_access on confidential clients.
    return client.grantTypeAllowed("refresh_token");
  },
  clients: [],
  cookies: {
    keys: [cookieKey],
  },
  interactions: {
    url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}`,
  },
  routes: {
    authorization: "/oauth/authorize",
    token: "/oauth/token",
    userinfo: "/oauth/userinfo",
    jwks: "/oauth/jwks",
    registration: "/oauth/register",
    revocation: "/oauth/revoke",
    introspection: "/oauth/introspect",
    end_session: "/oauth/end-session",
  },
  findAccount: async (_ctx, sub) => {
    const u = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, email: true, name: true, deletedAt: true },
    });
    if (!u || u.deletedAt) return undefined;
    return {
      accountId: u.id,
      claims: () => ({ sub: u.id, email: u.email, name: u.name }),
    };
  },
  });
}

// Lazy singleton. All callers use getProvider() so the env-var read happens
// at first use, not at module import time (keeps the Vercel build green even
// before env vars are configured).
let _provider: Provider | undefined;
export function getProvider(): Provider {
  if (!_provider) {
    _provider = buildProvider();
    _provider.proxy = true;
    _provider.on("server_error", (_ctx, err) => {
      console.error("[oidc-provider] server_error:", err);
    });
  }
  return _provider;
}

function cryptoRandomId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 14);
}
