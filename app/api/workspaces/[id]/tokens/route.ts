import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Reads or rotates the workspace's MCP connection URL.
//
// Same model as per-user URLs: the URL itself is not a credential — it just
// selects which workspace's permission set applies after the user finishes
// OAuth. Any user assigned to the workspace can use the same URL; the proxy
// confirms membership server-side before granting access.

type RouteCtx = { params: Promise<{ id: string }> };

function originOf(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  return `${proto}://${host}`;
}

function buildUrl(request: Request, mcpUid: string): string {
  return `${originOf(request)}/api/mcp/w/${mcpUid}`;
}

function generateUid(): string {
  return randomBytes(24).toString("base64url");
}

export async function GET(request: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const workspace = await prisma.workspace.findFirst({
    where: { id, deletedAt: null },
    select: { mcpUid: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  return NextResponse.json({
    mcpUid: workspace.mcpUid,
    url: workspace.mcpUid ? buildUrl(request, workspace.mcpUid) : null,
  });
}

// POST = generate (if absent) or rotate (if already set).
export async function POST(request: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const mcpUid = generateUid();
  await prisma.workspace.update({
    where: { id },
    data: { mcpUid },
  });
  return NextResponse.json({
    mcpUid,
    url: buildUrl(request, mcpUid),
  });
}
