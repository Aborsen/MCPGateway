-- AlterTable: add suspendedAt to User. Nullable so existing rows stay
-- "not suspended" by default. Authorize callback in lib/auth.ts blocks
-- sign-in when this is non-null.
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
