import { decryptJson, encryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { mockUpstreamCall, mockUpstreamList } from "./mock-upstream";
import { classifyToolByName } from "./permission-filter";
import { ERROR_CODES, type McpTool, type McpToolResult, MCP_PROTOCOL_VERSION } from "./types";
import { getOAuthCredentials, getOAuthProvider } from "@/lib/connector-oauth";

type Connector = {
  id: string;
  type: string;
  upstreamUrl: string;
  configEncrypted: string | null;
};

export type EncryptedConfig = {
  // Existing schemes for "Custom MCP URL" connectors.
  authScheme?: "bearer" | "customHeaders" | "none" | "oauth";
  apiKey?: string;
  customHeaders?: Record<string, string>;
  // OAuth-stored tokens for catalog connectors. `providerKey` is the same
  // key used in lib/connector-oauth.ts (e.g. "hubspot", "zoho-crm"); we
  // look up the token URL there to refresh.
  oauth?: {
    providerKey: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number; // epoch ms
  };
  // Free-form extras for vendor-specific routing (e.g. Zoho regional API
  // domain, Supabase project ref). Adapters read these directly.
  extra?: Record<string, string>;
};

// Reserved header keys an admin cannot override via customHeaders.
const RESERVED_HEADERS = new Set([
  "content-type",
  "accept",
  "mcp-session-id",
  "authorization",
  "host",
  "content-length",
]);

const listCache = new Map<string, { tools: McpTool[]; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function isMockUrl(url: string) {
  return /mcp\.example\.com/.test(url) || url.startsWith("mock:");
}

export async function listToolsFromUpstream(connector: Connector): Promise<McpTool[]> {
  const cached = listCache.get(connector.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tools;
  }

  let tools: McpTool[];
  if (isMockUrl(connector.upstreamUrl)) {
    tools = mockUpstreamList(connector.type);
  } else {
    tools = await fetchRealUpstreamList(connector);
  }
  listCache.set(connector.id, { tools, expiresAt: Date.now() + CACHE_TTL_MS });

  // Fire-and-forget discovery write — never blocks the proxy response.
  void persistDiscoveredTools(connector.id, tools).catch((err) => {
    console.warn(`[upstream-client] persistDiscoveredTools failed for ${connector.id}:`, err);
  });

  return tools;
}

export async function callToolOnUpstream(
  connector: Connector,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  if (isMockUrl(connector.upstreamUrl)) {
    return mockUpstreamCall(connector.type, toolName, args);
  }
  return await callRealUpstream(connector, toolName, args);
}

async function getAuthHeaders(connector: Connector): Promise<Record<string, string>> {
  if (!connector.configEncrypted) return {};
  const cfg = await decryptJson<EncryptedConfig>(connector.configEncrypted);
  if (!cfg) return {};
  const out: Record<string, string> = {};
  // Back-compat: rows created before scheme support stored only apiKey.
  const scheme: EncryptedConfig["authScheme"] = cfg.authScheme ?? (cfg.apiKey ? "bearer" : "none");
  if (scheme === "bearer" && cfg.apiKey) {
    out.Authorization = `Bearer ${cfg.apiKey}`;
  } else if (scheme === "customHeaders" && cfg.customHeaders) {
    for (const [k, v] of Object.entries(cfg.customHeaders)) {
      if (RESERVED_HEADERS.has(k.toLowerCase())) continue;
      out[k] = v;
    }
  } else if (scheme === "oauth" && cfg.oauth) {
    const token = await ensureFreshOAuthToken(connector.id, cfg);
    out.Authorization = `Bearer ${token}`;
  }
  return out;
}

// Refresh the upstream OAuth access token if expired (or about to expire),
// persisting the new token back to the connector. Returns the access token
// the caller should use on this request. Falls back to the existing token
// if refresh fails — the proxy then surfaces upstream's 401 naturally.
const REFRESH_LEEWAY_MS = 60_000; // refresh 60s early
export async function ensureFreshOAuthToken(
  connectorId: string,
  cfg: EncryptedConfig,
): Promise<string> {
  if (!cfg.oauth) return "";
  const { providerKey, accessToken, refreshToken, expiresAt } = cfg.oauth;
  const expired = expiresAt !== undefined && expiresAt - Date.now() < REFRESH_LEEWAY_MS;
  if (!expired || !refreshToken) return accessToken;

  const provider = getOAuthProvider(providerKey);
  const creds = getOAuthCredentials(providerKey);
  if (!provider || !creds) return accessToken;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });
    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) return accessToken;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return accessToken;
    const newCfg: EncryptedConfig = {
      ...cfg,
      oauth: {
        providerKey,
        accessToken: data.access_token,
        // Some vendors rotate the refresh token; keep the new one if sent.
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt:
          data.expires_in !== undefined ? Date.now() + data.expires_in * 1000 : undefined,
      },
    };
    const encrypted = await encryptJson(newCfg);
    await prisma.dataSource
      .update({ where: { id: connectorId }, data: { configEncrypted: encrypted } })
      .catch(() => undefined);
    return data.access_token;
  } catch {
    return accessToken;
  }
}

// Adapter routes hosted in this same Next.js app live under
// /api/upstream-mcp/... and require an internal-guard header so they can't
// be hit directly by third parties. The guard value is MCP_CONFIG_KEY,
// which is already required in production and which only this process
// knows. Detect "us calling us" by upstreamUrl prefix.
function isLoopbackAdapterUrl(url: string): boolean {
  const issuer = process.env.OIDC_ISSUER;
  if (!issuer) return false;
  return url.startsWith(`${issuer}/api/upstream-mcp/`);
}

async function buildHeaders(connector: Connector): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...(await getAuthHeaders(connector)),
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (isLoopbackAdapterUrl(connector.upstreamUrl) && process.env.MCP_CONFIG_KEY) {
    headers["x-mcpgw-internal"] = process.env.MCP_CONFIG_KEY;
  }
  return headers;
}

async function fetchRealUpstreamList(connector: Connector): Promise<McpTool[]> {
  const headers = await buildHeaders(connector);
  const initRes = await fetch(connector.upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "mcp-gateway-proxy", version: "0.1" },
      },
    }),
  });
  const sessionId = initRes.headers.get("Mcp-Session-Id");
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  await initRes.text();

  await fetch(connector.upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  const listRes = await fetch(connector.upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  if (!listRes.ok) {
    throw new UpstreamError(
      `Upstream tools/list returned ${listRes.status}: ${await listRes.text().catch(() => "")}`,
    );
  }
  const text = await listRes.text();
  const parsed = parseMaybeSse(text);
  if ("error" in parsed) throw new UpstreamError(parsed.error.message);
  const tools = (parsed.result as { tools?: McpTool[] } | undefined)?.tools ?? [];
  return tools;
}

const UPSTREAM_TIMEOUT_MS = 55_000;

async function callRealUpstream(
  connector: Connector,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const headers = await buildHeaders(connector);
  let res: Response;
  try {
    res = await fetch(connector.upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new UpstreamError(
        `Upstream timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s — try a more selective query or smaller pageSize`,
      );
    }
    throw err;
  }
  if (!res.ok) {
    throw new UpstreamError(`Upstream tools/call returned ${res.status}`);
  }
  const text = await res.text();
  const parsed = parseMaybeSse(text);
  if ("error" in parsed) {
    throw new UpstreamError(parsed.error.message);
  }
  const result = parsed.result as McpToolResult;
  if (result?.isError) {
    const innerText = extractTextFromToolResult(result);
    throw new UpstreamError(
      `Upstream tool error: ${innerText || "tool returned isError without text content"}`,
    );
  }
  return result;
}

function extractTextFromToolResult(result: McpToolResult): string {
  if (!result?.content || !Array.isArray(result.content)) return "";
  return result.content
    .filter((b): b is { type: "text"; text: string } => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join(" ")
    .trim();
}

function parseMaybeSse(
  text: string,
): { result: unknown } | { error: { code: number; message: string } } {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        return JSON.parse(payload);
      } catch {
        // continue
      }
    }
  }
  return { error: { code: ERROR_CODES.UPSTREAM_ERROR, message: "Unparseable upstream response" } };
}

async function persistDiscoveredTools(dataSourceId: string, tools: McpTool[]): Promise<void> {
  if (tools.length === 0) return;
  const existing = await prisma.toolPermission.findMany({
    where: { dataSourceId },
    select: { toolName: true },
  });
  const known = new Set(existing.map((t) => t.toolName));
  const now = new Date();

  for (const t of tools) {
    if (known.has(t.name)) {
      // Update lastSeenAt only; never overwrite level or classifiedBy.
      await prisma.toolPermission
        .update({
          where: { dataSourceId_toolName: { dataSourceId, toolName: t.name } },
          data: { lastSeenAt: now },
        })
        .catch(() => undefined);
    } else {
      // Insert new tool with heuristic classification.
      await prisma.toolPermission
        .upsert({
          where: { dataSourceId_toolName: { dataSourceId, toolName: t.name } },
          create: {
            dataSourceId,
            toolName: t.name,
            level: classifyToolByName(t.name).toUpperCase(),
            classifiedBy: "heuristic",
            lastSeenAt: now,
          },
          update: { lastSeenAt: now },
        })
        .catch(() => undefined);
    }
  }
}

class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}
