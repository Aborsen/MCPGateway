import { prisma } from "@/lib/db";
import { truncateJson } from "@/lib/json";

type AuditEntry = {
  userId: string | null;
  dataSourceId: string | null;
  method: string;
  toolName: string | null;
  request: unknown;
  response: unknown;
  status: "OK" | "ERROR";
  durationMs: number;
  errorMessage?: string | null;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        dataSourceId: entry.dataSourceId,
        method: entry.method,
        toolName: entry.toolName,
        requestJson: truncateJson(entry.request),
        responseJson: truncateJson(entry.response),
        status: entry.status,
        durationMs: Math.round(entry.durationMs),
        errorMessage: entry.errorMessage ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit row", err);
  }
}
