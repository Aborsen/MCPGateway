import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const REMAP: Record<string, string> = {
  jira: "operations",
  asana: "operations",
  monday: "operations",
  trello: "operations",

  zoho: "sales",
  salesforce: "sales",
  pipedrive: "sales",

  hubspot: "marketing",
  mailchimp: "marketing",
  marketo: "marketing",

  zendesk: "support",
  intercom: "support",
  freshdesk: "support",

  stripe: "finance",
  quickbooks: "finance",
  xero: "finance",

  amplitude: "performance",
  mixpanel: "performance",
  ga4: "performance",

  postgres: "database",
  mysql: "database",
  mssql: "database",
  mongodb: "database",
  redis: "database",

  rest: "other",
};

const VALID = new Set([
  "marketing",
  "sales",
  "support",
  "operations",
  "performance",
  "finance",
  "database",
  "other",
]);

async function main() {
  const sources = await prisma.dataSource.findMany();
  for (const ds of sources) {
    if (VALID.has(ds.type)) {
      console.log(`✓ ${ds.name.padEnd(20)} type="${ds.type}" already valid`);
      continue;
    }
    const next = REMAP[ds.type] ?? "other";
    await prisma.dataSource.update({ where: { id: ds.id }, data: { type: next } });
    console.log(`→ ${ds.name.padEnd(20)} "${ds.type}" → "${next}"`);
  }
  await prisma.$disconnect();
}
main();
