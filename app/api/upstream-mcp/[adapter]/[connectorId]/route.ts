import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import {
  ERROR_CODES,
  MCP_PROTOCOL_VERSION,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/mcp/types";
import {
  ensureFreshOAuthToken,
  type EncryptedConfig,
} from "@/lib/mcp/upstream-client";
import type { UpstreamAdapter } from "@/lib/upstream-adapters/types";
import { zohoCrmAdapter } from "@/lib/upstream-adapters/zoho-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Generic in-process MCP server. The main MCP proxy (/api/mcp/u/[uid] and
// /api/mcp/w/[uid]) doesn't know that this URL is "us serving us" — to it,
// this is just another upstream URL stored in DataSource.upstreamUrl.
//
// We auth this route by knowing the connectorId AND being able to decrypt
// configEncrypted (key lives in MCP_CONFIG_KEY). Anyone hitting this URL
// from the outside without an authenticated upstream proxy request gets
// the same response as the proxy would — the route doesn't try to be a
// secret. The data it returns is the same data that user would get
// through the proxy, just without the gateway permission checks. So we
// require an internal-call shared secret to keep it from being addressable
// without going through the main proxy. The proxy sets the
// `x-mcpgw-internal` header to the value of `MCP_CONFIG_KEY` (already
// required in prod), which a third-party caller cannot replicate.

const ADAPTERS: Record<string, UpstreamAdapter> = {
  "zoho-crm": zohoCrmAdapter,
};

function rpcSuccess(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ adapter: string; connectorId: string }> },
) {
  const { adapter: adapterName, connectorId } = await params;
  const adapter = ADAPTERS[adapterName];
  if (!adapter) {
    return NextResponse.json(rpcError(null, ERROR_CODES.METHOD_NOT_FOUND, `Unknown adapter '${adapterName}'`), {
      status: 404,
    });
  }

  // Internal-only access guard (see comment above).
  const guard = request.headers.get("x-mcpgw-internal");
  if (!guard || guard !== process.env.MCP_CONFIG_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const connector = await prisma.dataSource.findUnique({
    where: { id: connectorId },
    select: { id: true, configEncrypted: true },
  });
  if (!connector?.configEncrypted) {
    return NextResponse.json({ error: "connector_not_found_or_unconfigured" }, { status: 404 });
  }
  const cfg = await decryptJson<EncryptedConfig>(connector.configEncrypted);
  if (!cfg) {
    return NextResponse.json({ error: "config_decrypt_failed" }, { status: 500 });
  }

  // Refresh OAuth token if needed; pass the live token to the adapter.
  let accessToken: string | undefined;
  if (cfg.authScheme === "oauth" && cfg.oauth) {
    accessToken = await ensureFreshOAuthToken(connector.id, cfg);
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(rpcError(null, ERROR_CODES.PARSE_ERROR, "Invalid JSON"), {
      status: 400,
    });
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return NextResponse.json(
      rpcError(body.id ?? null, ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC envelope"),
    );
  }

  const ctx = { connectorId: connector.id, cfg, accessToken };

  try {
    switch (body.method) {
      case "initialize":
        return NextResponse.json(
          rpcSuccess(body.id ?? null, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: `mcp-gateway-${adapterName}`, version: "0.1.0" },
          }),
        );
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
        return new NextResponse(null, { status: 202 });
      case "ping":
        return NextResponse.json(rpcSuccess(body.id ?? null, {}));
      case "tools/list": {
        const tools = await adapter.listTools(ctx);
        return NextResponse.json(rpcSuccess(body.id ?? null, { tools }));
      }
      case "tools/call": {
        const p = body.params ?? {};
        const name = String(p.name ?? "");
        const args = (p.arguments as Record<string, unknown>) ?? {};
        const result = await adapter.callTool(ctx, name, args);
        return NextResponse.json(rpcSuccess(body.id ?? null, result));
      }
      default:
        return NextResponse.json(
          rpcError(body.id ?? null, ERROR_CODES.METHOD_NOT_FOUND, `Unknown method '${body.method}'`),
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Adapter error";
    return NextResponse.json(
      rpcError(body.id ?? null, ERROR_CODES.INTERNAL_ERROR, message),
    );
  }
}
