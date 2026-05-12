import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { encryptJson } from "@/lib/crypto";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().min(1).max(40).optional(),
  upstreamUrl: z.string().url().optional(),
  description: z.string().max(500).nullable().optional(),
  apiKey: z.string().nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.type !== undefined) update.type = data.type;
  if (data.upstreamUrl !== undefined) update.upstreamUrl = data.upstreamUrl;
  if (data.description !== undefined) update.description = data.description;
  if (data.apiKey !== undefined) {
    update.configEncrypted = data.apiKey ? await encryptJson({ apiKey: data.apiKey }) : null;
  }
  const updated = await prisma.dataSource.update({ where: { id }, data: update });
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  await requireAdmin();
  const { id } = await params;
  await prisma.dataSource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
