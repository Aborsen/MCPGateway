import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { generateMcpToken } from "@/lib/crypto";

const CreateSchema = z.object({
  label: z.string().min(1).max(80).optional().nullable(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id } = await params;
  const tokens = await prisma.userMcpToken.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  return NextResponse.json(tokens);
}

export async function POST(request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { token, tokenHash } = generateMcpToken();
  const created = await prisma.userMcpToken.create({
    data: { userId: id, tokenHash, label: parsed.data.label ?? null },
    select: { id: true, label: true, createdAt: true },
  });

  const origin = new URL(request.url).origin;
  const url = `${origin}/api/mcp/${token}`;

  return NextResponse.json({ ...created, token, url }, { status: 201 });
}
