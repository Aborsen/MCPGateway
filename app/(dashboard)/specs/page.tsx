import { readFile } from "node:fs/promises";
import path from "node:path";
import { PageHeader } from "@/components/layouts/page-header";
import { Markdown } from "./markdown";

// Renders the repo's SPECIFICATIONS.md as a server-rendered page. Lives
// inside (dashboard) so it inherits the layout's auth gate — non-admin
// USERs land on the "no dashboard access" view; only ADMIN and OWNER can
// see this page.

export const dynamic = "force-dynamic";

export default async function SpecsPage() {
  const filePath = path.join(process.cwd(), "SPECIFICATIONS.md");
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch {
    source =
      "# Specifications\n\n_SPECIFICATIONS.md is missing from the repo root._";
  }

  return (
    <>
      <PageHeader
        title="Specifications"
        description="Living spec for MCP Gateway — sourced from SPECIFICATIONS.md in the repo."
      />
      <div className="p-6">
        <Markdown source={source} />
      </div>
    </>
  );
}
