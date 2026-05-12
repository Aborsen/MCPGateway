import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { writeAdminEvent } from "@/lib/admin-events";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function PATCH(request: Request) {
  const session = await requireAuth();
  const userId = (session.user as { id: string }).id;
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name },
  });

  if (parsed.data.name !== before.name) {
    await writeAdminEvent({
      actorId: userId,
      targetUserId: userId,
      eventType: "USER_UPDATED",
      targetType: "user",
      targetId: userId,
      targetLabel: before.email,
      details: { changes: { name: { from: before.name, to: parsed.data.name } } },
    });
  }

  return NextResponse.json({ id: updated.id, name: updated.name, email: updated.email });
}
