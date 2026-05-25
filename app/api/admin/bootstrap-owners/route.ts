import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot: ensure known accounts have the Owner role globally. Idempotent
// — re-runs are no-ops once everyone's already an Owner. Hit it once after
// the role-system deploy; remove the file in a follow-up commit when the
// Owner population is stable.
//
// PR2b: the User.role column is gone. We now write a UserRole row pointing
// at the seeded "owner" system role for each target user.
//
// Auth: Authorization: Bearer ${CRON_SECRET} (same as the other admin
// one-shots).

const TARGETS = ["admin@devart.com", "victorg@devart.com"];

type Result = {
  email: string;
  ok: boolean;
  alreadyOwner?: boolean;
  error?: string;
};

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ownerRole = await prisma.role.findUnique({
    where: { slug: "owner" },
    select: { id: true },
  });
  if (!ownerRole) {
    return NextResponse.json(
      { error: 'Owner role missing — run the rbac seed first' },
      { status: 500 },
    );
  }

  const results: Result[] = [];
  for (const email of TARGETS) {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!user) {
        results.push({ email, ok: false, error: "user not found" });
        continue;
      }
      const existing = await prisma.userRole.findFirst({
        where: {
          userId: user.id,
          workspaceId: null,
          roleId: ownerRole.id,
        },
        select: { id: true },
      });
      if (existing) {
        results.push({ email, ok: true, alreadyOwner: true });
        continue;
      }
      await prisma.userRole.create({
        data: { userId: user.id, roleId: ownerRole.id, workspaceId: null },
      });
      results.push({ email, ok: true });
    } catch (err) {
      results.push({
        email,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 500 });
}
