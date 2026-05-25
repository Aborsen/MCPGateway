// One-off: set the password for admin@devart.com. Run via:
//   vercel env run --environment production -- npx tsx scripts/set-admin-password.ts
// (so DATABASE_URL is injected from the linked Vercel project)
//
// The plaintext password is read from the ADMIN_NEW_PASSWORD env var to keep
// it out of the script source.

import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TARGET_EMAIL = "admin@devart.com";

async function main() {
  const plain = process.env.ADMIN_NEW_PASSWORD;
  if (!plain) {
    throw new Error("ADMIN_NEW_PASSWORD not set in the calling shell.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (run via `vercel env run`).");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const before = await prisma.user.findUnique({
      where: { email: TARGET_EMAIL },
      select: { id: true, email: true, name: true },
    });
    if (!before) {
      throw new Error(`No user with email ${TARGET_EMAIL}`);
    }
    const hash = await bcrypt.hash(plain, 10);
    await prisma.user.update({
      where: { id: before.id },
      data: { passwordHash: hash },
    });
    console.log(`Password updated for ${before.email} (${before.name}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
