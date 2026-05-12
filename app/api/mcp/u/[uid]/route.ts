import { NextResponse } from "next/server";
import { provider, getMcpResourceUrl } from "@/lib/oidc/provider";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ uid: string }> };

// Bearer-auth MCP endpoint. The path :uid identifies which user's permission
// set applies (compared against the access token's `sub`). The actual auth
// is the OAuth access token in the Authorization header.
//
// NOTE: this is the auth shell. Full JSON-RPC dispatch (initialize/tools/...)
// will be ported from the existing /api/mcp/[token] route in a follow-up.
// For now this validates the bearer and returns a 200 echo as a smoke test.

export async function POST(request: Request, { params }: RouteCtx) {
  const { uid } = await params;
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    return unauthorized();
  }
  const token = auth.slice(7);

  const accessToken = await provider.AccessToken.find(token);
  if (!accessToken) {
    return unauthorized("invalid_token", "Access token not found or expired");
  }
  if (accessToken.isExpired) {
    return unauthorized("invalid_token", "Access token is expired");
  }

  const aud = Array.isArray(accessToken.aud) ? accessToken.aud[0] : accessToken.aud;
  if (aud !== getMcpResourceUrl()) {
    return unauthorized("invalid_token", "Access token audience does not match this resource");
  }
  if (!accessToken.scopes?.has("mcp")) {
    return unauthorized("insufficient_scope", "Access token is missing the 'mcp' scope");
  }

  const user = await prisma.user.findUnique({
    where: { mcpUid: uid },
    select: { id: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  if (user.id !== accessToken.accountId) {
    return NextResponse.json({ error: "uid_mismatch" }, { status: 403 });
  }

  // Smoke-test response. The real dispatcher port lands in a follow-up.
  const body = await request.json().catch(() => null);
  return NextResponse.json({
    jsonrpc: "2.0",
    id: body?.id ?? null,
    result: {
      ok: true,
      method: body?.method ?? null,
      userId: user.id,
      note: "OAuth bearer accepted; full dispatcher port pending.",
    },
  });
}

function unauthorized(error?: string, description?: string) {
  const resource = getMcpResourceUrl();
  const resourceMetadata = `${process.env.OIDC_ISSUER}/.well-known/oauth-protected-resource`;
  const parts = [
    `Bearer realm="MCP"`,
    `resource_metadata="${resourceMetadata}"`,
  ];
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
