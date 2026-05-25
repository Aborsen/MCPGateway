import NextAuth from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { writeAdminEvent } from "./admin-events";
import { can, canInWorkspace, isOwnerUser, isAdminUser } from "./permissions/resolve";
import type { Permission } from "./permissions/catalog";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email) },
        });
        if (!user || user.deletedAt) return null;
        if (user.suspendedAt) return null;
        const ok = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!ok) return null;
        // Role is no longer carried on the JWT — see lib/permissions/resolve
        // for the source of truth. The session only needs the user id.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      const id = (user as { id?: string }).id;
      const email = (user as { email?: string }).email ?? null;
      const name = (user as { name?: string }).name ?? null;
      if (!id) return;
      await writeAdminEvent({
        actorId: id,
        targetUserId: id,
        eventType: "USER_LOGIN",
        targetType: "user",
        targetId: id,
        targetLabel: email ?? name ?? id,
      });
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const userId = (token as { id?: string } | null)?.id;
      if (!userId) return;
      await writeAdminEvent({
        actorId: userId,
        targetUserId: userId,
        eventType: "USER_LOGOUT",
        targetType: "user",
        targetId: userId,
      });
    },
  },
});

// Returns the session or a 401 response. Callers in API routes MUST do:
//   const session = await requireAuth();
//   if (session instanceof NextResponse) return session;
// TypeScript will then narrow `session` to `Session` (with the typed user
// from `types/next-auth.d.ts`).
export async function requireAuth(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return session;
}

// Admin tier accepts both Admin and Owner. Reads UserRole rather than the
// JWT (the JWT no longer carries a role string; see Phase 2 PR2b).
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isAdminUser(session.user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}

// OWNER only. Used to gate destructive or escalation actions
// (delete user, assign OWNER role).
//
// Reads UserRole rather than the JWT role string: under USE_NEW_RBAC=true
// the JWT can lag the DB (Auth.js only refreshes on sign-in) so we go to
// the new-RBAC mirror as the source of truth.
export async function requireOwner(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isOwnerUser(session.user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}

// ============================================================================
// Phase 2 PR2 — permission-keyed gates.
// These replaced the old requireView/requireEdit/gateView (resource-shaped,
// driven by the static lib/rbac.ts matrix). Now every gate is a single
// permission key from lib/permissions/catalog.ts and the resolver decides
// whether the caller has it.
// ============================================================================

// Permission gate for API routes. Returns the session or a 401/403 NextResponse.
// Usage:
//   const auth = await requirePermission("connections.update");
//   if (auth instanceof NextResponse) return auth;
export async function requirePermission(
  permission: Permission,
): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, permission))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}

// Workspace-scoped permission gate. Used for endpoints that operate on a
// specific workspace where the user might be a Workspace Admin of only that
// workspace. The resolver merges global roles with workspace-scoped roles.
export async function requirePermissionInWorkspace(
  permission: Permission,
  workspaceId: string,
): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await canInWorkspace(session.user.id, permission, workspaceId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}

// Permission gate for server components (dashboard pages). Redirects to
// /login if unauthenticated; notFound() if missing permission (so deep-links
// can't bypass sidebar filtering).
export async function gatePermission(permission: Permission): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await can(session.user.id, permission))) notFound();
  return session;
}
