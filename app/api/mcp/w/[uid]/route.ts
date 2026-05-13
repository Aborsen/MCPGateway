import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getProvider, getMcpResourceUrl } from "@/lib/oidc/provider";
import { writeAudit } from "@/lib/mcp/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getWorkspaceMemberAccess,
  getToolLevel,
  classifyToolByName,
  extractTableFromArgs,
  isRawQueryTool,
  filterListedTablesText,
  LIST_TABLES_TOOL_NAMES,
  type UserAccess,
} from "@/lib/mcp/permission-filter";
import { listToolsFromUpstream, callToolOnUpstream } from "@/lib/mcp/upstream-client";
import { buildServerInfo } from "@/lib/mcp/server-info";
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

type RouteCtx = { params: Promise<{ uid: string }> };

function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}
function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

class JsonRpcException extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function unauthorized(error?: string, description?: string) {
  const resource = getMcpResourceUrl();
  const resourceMetadata = `${process.env.OIDC_ISSUER}/.well-known/oauth-protected-resource`;
  const parts = [`Bearer realm="MCP"`, `resource_metadata="${resourceMetadata}"`];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description}"`);
  return new NextResponse(JSON.stringify({ error: error ?? "missing_token", resource }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": parts.join(", "),
    },
  });
}

export async function POST(request: Request, { params }: RouteCtx) {
  const start = Date.now();
  const { uid } = await params;

  // --- Bearer-auth shell (identical to /u/) ---
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return unauthorized();
  }
  const token = authHeader.slice(7);
  const accessToken = await getProvider().AccessToken.find(token);
  if (!accessToken) return unauthorized("invalid_token", "Access token not found or expired");
  if (accessToken.isExpired) return unauthorized("invalid_token", "Access token is expired");
  const expectedResource = getMcpResourceUrl();
  const tokenResource =
    (accessToken as unknown as { resource?: string }).resource ??
    (Array.isArray(accessToken.aud) ? accessToken.aud[0] : accessToken.aud);
  if (tokenResource !== expectedResource) {
    return unauthorized("invalid_token", "Access token audience does not match this resource");
  }
  if (!accessToken.scopes?.has("mcp")) {
    return unauthorized("insufficient_scope", "Access token is missing the 'mcp' scope");
  }

  // --- Workspace + membership resolution ---
  const accountId = accessToken.accountId as string;
  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({
      where: { id: accountId },
      select: { id: true, deletedAt: true },
    }),
    prisma.workspace.findUnique({
      where: { mcpUid: uid },
      select: { id: true, deletedAt: true, name: true },
    }),
  ]);
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (!workspace || workspace.deletedAt) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }
  const membership = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json(
      {
        error: "not_a_member",
        message: `You are not a member of workspace '${workspace.name}'.`,
      },
      { status: 403 },
    );
  }
  const userId = user.id;
  const workspaceId = workspace.id;

  // --- Rate limit: per (workspace, account) pair. A user in two workspaces
  // gets independent budgets per workspace URL.
  const rl = checkRateLimit(`mcp:w:${workspaceId}:${userId}`, 60, 60_000);
  if (!rl.ok) {
    const err = jsonRpcError(
      null,
      ERROR_CODES.INTERNAL_ERROR,
      `Rate limit exceeded. Retry after ${rl.retryAfterSec}s.`,
    );
    return NextResponse.json(err, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSec) },
    });
  }

  // --- JSON-RPC body ---
  let body: JsonRpcRequest;
  let rawBodyText: string;
  try {
    rawBodyText = await request.text();
    body = JSON.parse(rawBodyText);
  } catch {
    const err = jsonRpcError(null, ERROR_CODES.PARSE_ERROR, "Invalid JSON");
    after(() =>
      writeAudit({
        userId,
        dataSourceId: null,
        method: "malformed",
        toolName: null,
        request: { rawPreview: (rawBodyText ?? "").slice(0, 500) },
        response: err,
        status: "ERROR",
        durationMs: Date.now() - start,
        errorMessage: "Malformed JSON body",
      }),
    );
    return NextResponse.json(err, { status: 400 });
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    const err = jsonRpcError(body.id ?? null, ERROR_CODES.INVALID_REQUEST, "Invalid JSON-RPC request");
    after(() =>
      writeAudit({
        userId,
        dataSourceId: null,
        method: "invalid",
        toolName: null,
        request: body,
        response: err,
        status: "ERROR",
        durationMs: Date.now() - start,
        errorMessage: "Body is not a valid JSON-RPC 2.0 request",
      }),
    );
    return NextResponse.json(err);
  }

  // --- Dispatch ---
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
          serverInfo: buildServerInfo(`MCP Gateway — ${workspace.name}`),
        });
        const res = NextResponse.json(response, { headers: { "Mcp-Session-Id": sessionId } });
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
      case "notifications/progress": {
        after(() =>
          writeAudit({
            userId,
            dataSourceId: null,
            method: body.method,
            toolName: null,
            request: body,
            response: { accepted: true },
            status: "OK",
            durationMs: Date.now() - start,
          }),
        );
        return new NextResponse(null, { status: 202 });
      }

      case "ping":
        response = jsonRpcSuccess(body.id ?? null, {});
        break;

      case "tools/list": {
        const access = await getWorkspaceMemberAccess(userId, workspaceId);
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

        const access = await getWorkspaceMemberAccess(userId, workspaceId);
        const connector = access.find((a) => a.dataSourceSlug === slug);
        if (!connector) {
          throw new JsonRpcException(
            ERROR_CODES.FORBIDDEN,
            `Workspace '${workspace.name}' has no access to data source '${slug}'.`,
          );
        }
        dataSourceId = connector.dataSourceId;

        const required = await getToolLevel(connector.dataSourceId, toolName);
        if (!connector.permissions.has(required)) {
          throw new JsonRpcException(
            ERROR_CODES.FORBIDDEN,
            `Tool '${toolName}' requires '${required}' permission. Your access in this workspace: ${Array.from(connector.permissions).join(", ") || "(none)"}.`,
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

        if (connector.allowedTables && LIST_TABLES_TOOL_NAMES.has(toolName)) {
          result = filterListResult(result, connector.allowedTables);
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
      info: "MCP Gateway endpoint (workspace-scoped)",
      protocol: "MCP / JSON-RPC 2.0 over HTTP POST",
      auth: "OAuth 2.1 Bearer (see /.well-known/oauth-protected-resource)",
    },
    { status: 200 },
  );
}

// Same aggregator as /u/, batched by dataSourceId. Kept inline to avoid
// pulling the dispatch logic into a shared module mid-feature — refactor if
// the two routes diverge less than expected over time.
async function aggregateTools(access: UserAccess[]) {
  const dataSourceIds = access.map((a) => a.dataSourceId);
  const allLevels =
    dataSourceIds.length === 0
      ? []
      : await prisma.toolPermission.findMany({
          where: { dataSourceId: { in: dataSourceIds } },
        });
  const levelsByDs = new Map<string, Map<string, string>>();
  for (const tp of allLevels) {
    let inner = levelsByDs.get(tp.dataSourceId);
    if (!inner) {
      inner = new Map();
      levelsByDs.set(tp.dataSourceId, inner);
    }
    inner.set(tp.toolName, tp.level.toLowerCase());
  }

  const all = await Promise.all(
    access.map(async (a) => {
      const upstreamTools = await listToolsFromUpstream({
        id: a.dataSourceId,
        type: a.dataSourceType,
        upstreamUrl: a.upstreamUrl,
        configEncrypted: a.configEncrypted,
      }).catch((err) => {
        console.error(
          `[mcp/w/tools/list] upstream "${a.dataSourceName}" (${a.upstreamUrl}) failed:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      });

      const levels = levelsByDs.get(a.dataSourceId) ?? new Map<string, string>();

      return upstreamTools
        .filter((t) => {
          const seeded = levels.get(t.name) as
            | "select"
            | "insert"
            | "update"
            | "delete"
            | "execute"
            | undefined;
          const required = seeded ?? classifyToolByName(t.name);
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

function filterListResult(result: McpToolResult, allowed: string[]): McpToolResult {
  return {
    ...result,
    content: result.content.map((c) => {
      if (c.type !== "text") return c;
      return { type: "text" as const, text: filterListedTablesText(c.text, allowed) };
    }),
  };
}

