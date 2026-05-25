import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { PERMISSION_ENTRIES } from "@/lib/permissions/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// "Explain access" — for each permission key in the catalog, returns:
//   - whether the user currently has it,
//   - the path it came from (which role(s), with workspace scope, plus
//     any override that flipped the result).
//
// This is the answer to "is it the role or the override?" — the question
// the hybrid model raises every time an override is in play.
export async function GET(_request: Request, { params }: RouteCtx) {
  const { id: userId } = await params;
  const auth = await requirePermission("permissions.view");
  if (auth instanceof NextResponse) return auth;

  const [user, assignments, overrides] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, deletedAt: true },
    }),
    prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: { rolePermissions: { select: { permissionKey: true } } },
        },
        workspace: { select: { id: true, name: true } },
      },
    }),
    prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { workspace: { select: { id: true, name: true } } },
      orderBy: { grantedAt: "desc" },
    }),
  ]);

  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = new Date();

  // Build the effective set, recording provenance.
  // grantedBy: list of {assignmentId, roleSlug, roleName, workspaceName?}
  // overriddenBy: the single most-recent active override that touches this key.
  type Provenance = {
    grantedBy: {
      assignmentId: string;
      roleSlug: string;
      roleName: string;
      workspaceName: string | null;
    }[];
    overriddenBy: {
      id: string;
      effect: "GRANT" | "REVOKE";
      reason: string | null;
      workspaceName: string | null;
      expiresAt: string | null;
    } | null;
    has: boolean;
  };

  const byKey = new Map<string, Provenance>();
  for (const entry of PERMISSION_ENTRIES) {
    byKey.set(entry.key, { grantedBy: [], overriddenBy: null, has: false });
  }

  // Role-derived grants.
  for (const a of assignments) {
    for (const rp of a.role.rolePermissions) {
      const p = byKey.get(rp.permissionKey);
      if (!p) continue; // permission no longer in catalog
      p.grantedBy.push({
        assignmentId: a.id,
        roleSlug: a.role.slug,
        roleName: a.role.name,
        workspaceName: a.workspace?.name ?? null,
      });
      p.has = true;
    }
  }

  // Apply overrides (skip expired). Most-recent wins for the "what flipped it"
  // attribution, but the GRANT/REVOKE semantics are still last-wins overall.
  // We iterate overrides newest-first so the FIRST one we touch per key is
  // the explanation we surface.
  for (const o of overrides) {
    if (o.expiresAt && o.expiresAt <= now) continue;
    const p = byKey.get(o.permissionKey);
    if (!p) continue;
    if (!p.overriddenBy) {
      p.overriddenBy = {
        id: o.id,
        effect: o.effect as "GRANT" | "REVOKE",
        reason: o.reason,
        workspaceName: o.workspace?.name ?? null,
        expiresAt: o.expiresAt?.toISOString() ?? null,
      };
    }
    // Newest-first iteration means the first override determines the effect.
    // But we still want the final has=… to reflect ALL overrides; iterate
    // in chronological order for the actual application.
  }
  // Second pass, oldest-first, to actually apply effect chronologically —
  // ensures multiple overrides on the same key compose deterministically.
  for (let i = overrides.length - 1; i >= 0; i--) {
    const o = overrides[i];
    if (o.expiresAt && o.expiresAt <= now) continue;
    const p = byKey.get(o.permissionKey);
    if (!p) continue;
    if (o.effect === "GRANT") p.has = true;
    else if (o.effect === "REVOKE") p.has = false;
  }

  // Group by category for the UI.
  const grouped: Record<
    string,
    { key: string; label: string; description: string } & Provenance[]
  > = {} as never;
  const result = PERMISSION_ENTRIES.map((entry) => {
    const p = byKey.get(entry.key)!;
    return {
      key: entry.key,
      label: entry.label,
      category: entry.category,
      description: entry.description,
      ...p,
    };
  });
  void grouped; // structure is built client-side from the flat list

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    permissions: result,
    assignments: assignments.map((a) => ({
      id: a.id,
      roleId: a.roleId,
      roleSlug: a.role.slug,
      roleName: a.role.name,
      isSystemRole: a.role.isSystem,
      workspaceId: a.workspaceId,
      workspaceName: a.workspace?.name ?? null,
      grantedAt: a.grantedAt.toISOString(),
    })),
    overrides: overrides
      .filter((o) => !o.expiresAt || o.expiresAt > now)
      .map((o) => ({
        id: o.id,
        permissionKey: o.permissionKey,
        effect: o.effect,
        reason: o.reason,
        workspaceId: o.workspaceId,
        workspaceName: o.workspace?.name ?? null,
        grantedAt: o.grantedAt.toISOString(),
        expiresAt: o.expiresAt?.toISOString() ?? null,
      })),
  });
}
