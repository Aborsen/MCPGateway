import { decryptJson } from "@/lib/crypto";
import { mockUpstreamCall, mockUpstreamList } from "./mock-upstream";
import { ERROR_CODES, type McpTool, type McpToolResult, MCP_PROTOCOL_VERSION } from "./types";

type Connector = {
  id: string;
  type: string;
  upstreamUrl: string;
  configEncrypted: string | null;
};

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
  const cfg = await decryptJson<{ apiKey?: string }>(connector.configEncrypted);
  if (!cfg?.apiKey) return {};
  return { Authorization: `Bearer ${cfg.apiKey}` };
}

async function fetchRealUpstreamList(connector: Connector): Promise<McpTool[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(await getAuthHeaders(connector)),
  };
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
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(await getAuthHeaders(connector)),
  };
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

function parseMaybeSse(text: string): { result: unknown } | { error: { code: number; message: string } } {
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

class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}
