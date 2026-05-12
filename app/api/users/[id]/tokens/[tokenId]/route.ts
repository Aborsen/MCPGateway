import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

type RouteCtx = { params: Promise<{ id: string; tokenId: string }> };

export async function DELETE(_request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id, tokenId } = await params;
  await prisma.userMcpToken.update({
    where: { id: tokenId, userId: id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
