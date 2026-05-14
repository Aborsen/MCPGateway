import type { McpTool, McpToolResult } from "@/lib/mcp/types";
import type { EncryptedConfig } from "@/lib/mcp/upstream-client";

// All upstream adapters implement this shape. The generic route at
// /api/upstream-mcp/<adapter>/<connectorId> looks up the adapter by name,
// decrypts the connector's config, and dispatches the matching method.
//
// Adapters are responsible for:
//   - returning the static tool catalog (tools/list)
//   - executing a single tool call (tools/call)
//
// The route handles MCP envelope concerns (JSON-RPC framing, error codes,
// audit fan-out, OAuth-token refresh) so adapters stay focused on the
// vendor's REST surface.

export type AdapterContext = {
  connectorId: string;
  cfg: EncryptedConfig;
  // Fresh OAuth access token (already-refreshed if needed). undefined if
  // the connector isn't OAuth-backed.
  accessToken?: string;
};

export type UpstreamAdapter = {
  // Display name shown in error messages.
  name: string;
  // Static tool list for this adapter. Adapters can return per-instance
  // tool variations by reading ctx.cfg.extra (e.g. account-specific
  // modules), so this is a function rather than a constant.
  listTools(ctx: AdapterContext): Promise<McpTool[]> | McpTool[];
  // Run a single tool call.
  callTool(
    ctx: AdapterContext,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult>;
};
