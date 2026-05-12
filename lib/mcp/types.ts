export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcSuccess<T = unknown> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: T;
};

export type JsonRpcError = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError?: boolean;
};

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_FALLBACK_VERSION = "2025-03-26";

export const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHORIZED: -32001,
  FORBIDDEN: -32002,
  UPSTREAM_ERROR: -32010,
} as const;

export type PermissionLevel = "select" | "insert" | "update" | "delete" | "execute";

export const ALL_PERMISSION_LEVELS: PermissionLevel[] = [
  "select",
  "insert",
  "update",
  "delete",
  "execute",
];
