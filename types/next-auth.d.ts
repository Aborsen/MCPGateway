import "next-auth";
import "next-auth/jwt";

// Phase 2 PR2b dropped role from the JWT/session. Role lookups go through
// lib/permissions/resolve (isOwnerUser, isAdminUser, primarySystemRoleFor)
// against the UserRole table.

declare module "next-auth" {
  interface User {
    id: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}
