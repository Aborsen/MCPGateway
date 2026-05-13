import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8414. We emit this document ourselves rather than proxying to
// oidc-provider's built-in /.well-known/openid-configuration: the bridge
// from fetch-to-node leaves req.socket null, and oidc-provider's internal
// urlFor() throws when constructing absolute URLs without it.
//
// All endpoint paths must match the `routes` block in lib/oidc/provider.ts.
export async function GET(): Promise<Response> {
  const issuer = process.env.OIDC_ISSUER;
  if (!issuer) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  return NextResponse.json({
    issuer,
    // OIDC RP-Initiated Logout / Dynamic Client Registration use logo_uri for
    // server branding. Some MCP clients also read this when picking an icon
    // for the server in their connector list.
    logo_uri: `${issuer}/logo.png`,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    introspection_endpoint: `${issuer}/oauth/introspect`,
    end_session_endpoint: `${issuer}/oauth/end-session`,
    scopes_supported: ["openid", "mcp", "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query", "fragment", "form_post"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256", "ES256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: ["sub", "email", "name", "iss", "aud", "exp", "iat"],
    authorization_response_iss_parameter_supported: true,
    require_pushed_authorization_requests: false,
  });
}
