import NextAuth from "next-auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { writeAdminEvent } from "./admin-events";

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
        const ok = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
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

// Admin tier accepts both ADMIN and SUPER_ADMIN.
const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

// Returns the session or a 401/403 response. Accepts ADMIN or SUPER_ADMIN.
export async function requireAdmin(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!ADMIN_ROLES.has(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}

// SUPER_ADMIN only. Used to gate destructive or escalation actions
// (delete user, assign SUPER_ADMIN role).
export async function requireSuperAdmin(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return session;
}
