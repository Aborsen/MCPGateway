-- AlterTable: add mcpUid to Workspace for per-workspace MCP URLs
ALTER TABLE "Workspace" ADD COLUMN "mcpUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_mcpUid_key" ON "Workspace"("mcpUid");
