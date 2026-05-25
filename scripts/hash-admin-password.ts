// Generates a bcrypt hash for the admin password so you can paste an UPDATE
// into the Neon SQL console. Run with:
//   ADMIN_NEW_PASSWORD='...' npx tsx scripts/hash-admin-password.ts
import bcrypt from "bcryptjs";

async function main() {
  const plain = process.env.ADMIN_NEW_PASSWORD;
  if (!plain) {
    console.error("ADMIN_NEW_PASSWORD not set.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(plain, 10);
  const escaped = hash.replace(/'/g, "''");
  console.log("hash:", hash);
  console.log();
  console.log("Neon SQL:");
  console.log(`UPDATE "User" SET "passwordHash" = '${escaped}' WHERE email = 'admin@devart.com';`);
}

main();
