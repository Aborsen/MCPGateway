import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { canInWorkspace } from "@/lib/permissions/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk soft-delete workspaces. The per-row permission is workspaces.delete
// (scopeable) so this enforces canInWorkspace for every id individually —
// a workspace_admin scoped to one workspace can bulk-delete the workspaces
// they manage and gets a 403 row for any other workspace included in the
// request. Same per-row success/failure shape as the user bulk-delete.

const BodySchema = z.object({
  workspaceIds: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  const session = await requireAuth();
  if (session instanceof NextResponse) return session;
  const body = await request.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { workspaceIds } = parsed.data;

  const targets = await prisma.workspace.findMany({
    where: { id: { in: workspaceIds }, deletedAt: null },
    select: { id: true, name: true },
  });

  const results: { workspaceId: string; ok: boolean; error?: string }[] = [];
  for (const workspaceId of workspaceIds) {
    const target = targets.find((t) => t.id === workspaceId);
    if (!target) {
      results.push({
        workspaceId,
        ok: false,
        error: "not found or already deleted",
      });
      continue;
    }
    if (!(await canInWorkspace(session.user.id, "workspaces.delete", workspaceId))) {
      results.push({
        workspaceId,
        ok: false,
        error: "forbidden: missing workspaces.delete",
      });
      continue;
    }
    try {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { deletedAt: new Date() },
      });
      // Audit-event parity note: the single-workspace DELETE
      // (/api/workspaces/[id]) does not write an AdminEvent today either.
      // When that gap is closed, mirror the same event type here.
      results.push({ workspaceId, ok: true });
    } catch (err) {
      results.push({
        workspaceId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: okCount > 0,
    succeeded: okCount,
    failed: results.length - okCount,
    results,
  });
}
