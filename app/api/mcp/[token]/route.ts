import { NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { hashMcpToken } from "@/lib/crypto";
import { writeAudit } from "@/lib/mcp/audit";
import {
  getUserAccess,
  getToolLevel,
  extractTableFromArgs,
  isRawQueryTool,
  filterListedTablesPayload,
  type UserAccess,
} from "@/lib/mcp/permission-filter";
import { listToolsFromUpstream, callToolOnUpstream } from "@/lib/mcp/upstream-client";
import {
  ERROR_CODES,
  MCP_PROTOCOL_VERSION,
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpToolResult,
} from "@/lib/mcp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteCtx = { params: Promise<{ token: string }> };

function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

export async function POST(request: Request, { params }: RouteCtx) {
  const start = Date.now();
  const { token } = await params;
  const tokenHash = hashMcpToken(token);

  const tokenRow = await prisma.userMcpToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!tokenRow || tokenRow.revokedAt || tokenRow.user.deletedAt) {
    return NextResponse.json(
      jsonRpcError(null, ERROR_CODES.UNAUTHORIZED, "Invalid or revoked token"),
      { status: 401 },
    );
  }

  const userId = tokenRow.userId;
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      jsonRpcError(null, ERROR_CODES.PARSE_ERROR, "Invalid JSON"),
      { status: 400 },
    );
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return NextResponse.json(
      jsonRpcError(body.id ?? null, ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC request"),
    );
  }

  let response: JsonRpcResponse | null = null;
  let errorMessage: string | null = null;
  let toolName: string | null = null;
  let dataSourceId: string | null = null;

  try {
    switch (body.method) {
      case "initialize": {
        const sessionId = crypto.randomUUID();
        response = jsonRpcSuccess(body.id ?? null, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "ai-connectivity", version: "0.1.0" },
        });
        const res = NextResponse.json(response, {
          headers: { "Mcp-Session-Id": sessionId },
        });
        prisma.userMcpToken
          .update({ where: { id: tokenRow.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
        after(() =>
          writeAudit({
            userId,
            dataSourceId: null,
            method: "initialize",
            toolName: null,
            request: body,
            response,
            status: "OK",
            durationMs: Date.now() - start,
          }),
        );
        return res;
      }
      case "notifications/initialized":
      case "notifications/cancelled":
      case "notifications/progress":
        return new NextResponse(null, { status: 202 });

      case "ping":
        response = jsonRpcSuccess(body.id ?? null, {});
        break;

      case "tools/list": {
        const access = await getUserAccess(userId);
        const tools = await aggregateTools(access);
        response = jsonRpcSuccess(body.id ?? null, { tools });
        break;
      }

      case "tools/call": {
        const params_ = body.params ?? {};
        const fullName = String(params_.name ?? "");
        const args = (params_.arguments as Record<string, unknown>) ?? {};
        const sepIdx = fullName.indexOf("__");
        if (sepIdx < 0) {
          throw new JsonRpcException(
            ERROR_CODES.INVALID_PARAMS,
            `Tool name '${fullName}' missing connector prefix (expected '<slug>__<tool>').`,
          );
        }
        const slug = fullName.slice(0, sepIdx);
        toolName = fullName.slice(sepIdx + 2);

        const access = await getUserAccess(userId);
        const connector = access.find((a) => a.dataSourceSlug === slug);
        if (!connector) {
          throw new JsonRpcException(
            ERROR_CODES.FORBIDDEN,
            `No access to data source '${slug}' for this user.`,
          );
        }
        dataSourceId = connector.dataSourceId;

        const required = await getToolLevel(connector.dataSourceId, toolName);
        if (!connector.permissions.has(required)) {
          throw new JsonRpcException(
            ERROR_CODES.FORBIDDEN,
            `Tool '${toolName}' requires '${required}' permission. Your access: ${Array.from(connector.permissions).join(", ") || "(none)"}.`,
          );
        }

        if (connector.allowedTables) {
          if (isRawQueryTool(toolName)) {
            throw new JsonRpcException(
              ERROR_CODES.FORBIDDEN,
              `Raw query tool '${toolName}' is blocked because this workspace restricts tables.`,
            );
          }
          const requestedTable = extractTableFromArgs(args);
          if (requestedTable && !connector.allowedTables.includes(requestedTable)) {
            throw new JsonRpcException(
              ERROR_CODES.FORBIDDEN,
              `Table '${requestedTable}' is not in the allowed list for this workspace: ${connector.allowedTables.join(", ")}.`,
            );
          }
        }

        let result = await callToolOnUpstream(
          {
            id: connector.dataSourceId,
            type: connector.dataSourceType,
            upstreamUrl: connector.upstreamUrl,
            configEncrypted: connector.configEncrypted,
          },
          toolName,
          args,
        );

        if (connector.allowedTables && (toolName === "list_tables" || toolName === "list_resources")) {
          result = filterListPayload(result, connector.allowedTables);
        }

        response = jsonRpcSuccess(body.id ?? null, result);
        break;
      }

      default:
        throw new JsonRpcException(
          ERROR_CODES.METHOD_NOT_FOUND,
          `Method '${body.method}' is not supported by this proxy.`,
        );
    }
  } catch (err) {
    if (err instanceof JsonRpcException) {
      response = jsonRpcError(body.id ?? null, err.code, err.message);
      errorMessage = err.message;
    } else {
      const message = err instanceof Error ? err.message : "Unknown error";
      response = jsonRpcError(body.id ?? null, ERROR_CODES.INTERNAL_ERROR, message);
      errorMessage = message;
    }
  }

  const finalResponse = response;
  const durationMs = Date.now() - start;
  prisma.userMcpToken
    .update({ where: { id: tokenRow.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
  after(() =>
    writeAudit({
      userId,
      dataSourceId,
      method: body.method,
      toolName,
      request: body,
      response: finalResponse,
      status: errorMessage ? "ERROR" : "OK",
      durationMs,
      errorMessage,
    }),
  );

  return NextResponse.json(finalResponse);
}

export async function GET() {
  return NextResponse.json(
    {
      info: "AI Connectivity MCP endpoint",
      protocol: "MCP / JSON-RPC 2.0 over HTTP POST",
      note: "Paste this URL into your MCP client (e.g. Claude Code .mcp.json).",
    },
    { status: 200 },
  );
}

class JsonRpcException extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

async function aggregateTools(access: UserAccess[]) {
  const all = await Promise.all(
    access.map(async (a) => {
      const upstreamTools = await listToolsFromUpstream({
        id: a.dataSourceId,
        type: a.dataSourceType,
        upstreamUrl: a.upstreamUrl,
        configEncrypted: a.configEncrypted,
      }).catch((err) => {
        console.error(
          `[mcp/tools/list] upstream "${a.dataSourceName}" (${a.upstreamUrl}) failed:`,
          err instanceof Error ? err.message : err,
          err instanceof Error ? err.stack : "",
        );
        return [];
      });
      console.log(
        `[mcp/tools/list] connector "${a.dataSourceName}" returned ${upstreamTools.length} tools`,
      );

      const levelMap = await prisma.toolPermission.findMany({
        where: { dataSourceId: a.dataSourceId },
      });
      const levels = new Map(levelMap.map((tp) => [tp.toolName, tp.level.toLowerCase()]));

      return upstreamTools
        .filter((t) => {
          const required = (levels.get(t.name) ?? "write") as "read" | "write" | "delete";
          if (!a.permissions.has(required)) return false;
          if (a.allowedTables && isRawQueryTool(t.name)) return false;
          return true;
        })
        .map((t) => ({
          name: `${a.dataSourceSlug}__${t.name}`,
          description: `[${a.dataSourceName}] ${t.description ?? ""}`.trim(),
          inputSchema: t.inputSchema,
        }));
    }),
  );
  return all.flat();
}

function filterListPayload(result: McpToolResult, allowed: string[]): McpToolResult {
  return {
    ...result,
    content: result.content.map((c) => {
      if (c.type !== "text") return c;
      try {
        const parsed = JSON.parse(c.text);
        const filtered = filterListedTablesPayload(parsed, allowed);
        return { type: "text" as const, text: JSON.stringify(filtered, null, 2) };
      } catch {
        return c;
      }
    }),
  };
}
