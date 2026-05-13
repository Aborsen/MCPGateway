import { NextResponse } from "next/server";
import { getMcpResourceUrl } from "@/lib/oidc/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728: OAuth 2.0 Protected Resource Metadata.
// Claude (and any spec-compliant MCP client) discovers the authorization
// server via this document after receiving a 401 from the resource endpoint.
export async function GET(): Promise<Response> {
  const resource = getMcpResourceUrl();
  const issuer = process.env.OIDC_ISSUER!;
  return NextResponse.json({
    resource,
    // resource_name + logo_uri let MCP clients display a branded entry for
    // the gateway in their connector list before any tokens are issued.
    resource_name: "MCP Gateway",
    logo_uri: `${issuer}/logo.png`,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_signing_alg_values_supported: ["RS256", "ES256"],
  });
}
