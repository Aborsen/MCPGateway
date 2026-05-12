import { decryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { mockUpstreamCall, mockUpstreamList } from "./mock-upstream";
import { classifyToolByName } from "./permission-filter";
import { ERROR_CODES, type McpTool, type McpToolResult, MCP_PROTOCOL_VERSION } from "./types";

type Connector = {
  id: string;
  type: string;
  upstreamUrl: string;
  configEncrypted: string | null;
};

export type EncryptedConfig = {
  authScheme?: "bearer" | "customHeaders" | "none";
  apiKey?: string;
  customHeaders?: Record<string, string>;
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
  }
  return out;
}

async function buildHeaders(connector: Connector): Promise<Record<string, string>> {
  // Auth headers first; protocol headers spread last to win on collision.
  return {
    ...(await getAuthHeaders(connector)),
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
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
        clientInfo: { name: "ai-connectivity-proxy", version: "0.1" },
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

async function callRealUpstream(
  connector: Connector,
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const headers = await buildHeaders(connector);
  const res = await fetch(connector.upstreamUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });
  if (!res.ok) {
    throw new UpstreamError(`Upstream tools/call returned ${res.status}`);
  }
  const text = await res.text();
  const parsed = parseMaybeSse(text);
  if ("error" in parsed) {
    throw new UpstreamError(parsed.error.message);
  }
  return parsed.result as McpToolResult;
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
