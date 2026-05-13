import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Reads or rotates the user's MCP connection URL.
//
// Under the OAuth model the URL is no longer a credential — it just selects
// which user's permission set applies when Claude connects. The actual
// authentication is the OAuth access token (issued via /oauth/authorize and
// the user's email/password). So the URL can be shown to the admin any
// number of times.

type RouteCtx = { params: Promise<{ id: string }> };

function originOf(request: Request): string {
  // Honor X-Forwarded-* in case Vercel terminates TLS.
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  return `${proto}://${host}`;
}

function buildUrl(request: Request, mcpUid: string): string {
  return `${originOf(request)}/api/mcp/u/${mcpUid}`;
}

function generateUid(): string {
  return randomBytes(24).toString("base64url");
}

export async function GET(request: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { mcpUid: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({
    mcpUid: user.mcpUid,
    url: user.mcpUid ? buildUrl(request, user.mcpUid) : null,
  });
}

// POST = generate (if absent) or rotate (if already set).
export async function POST(request: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const mcpUid = generateUid();
  await prisma.user.update({
    where: { id },
    data: { mcpUid },
  });
  return NextResponse.json({
    mcpUid,
    url: buildUrl(request, mcpUid),
  }, { status: 200 });
}
