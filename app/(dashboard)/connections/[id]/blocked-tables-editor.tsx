"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TablesViewer } from "@/components/tables-viewer";

// Edit-mode wrapper around TablesViewer. Pre-checks the connector's current
// blockedTables list, opens the picker labeled for blocking, and PATCHes the
// connection with the new array on Apply. Read-only viewers (no
// connections.update permission) shouldn't render this at all — the page
// gates that.

export function BlockedTablesEditor({
  dataSourceId,
  dataSourceName,
  initialBlocked,
}: {
  dataSourceId: string;
  dataSourceName: string;
  initialBlocked: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Keep a local copy so refresh-after-save doesn't re-snap the dialog
  // open on the stale list.
  const [blocked, setBlocked] = useState<string[]>(initialBlocked);

  async function onApply(names: string[]) {
    const res = await fetch(`/api/connections/${dataSourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedTables: names }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? `Save failed (${res.status})`);
      return;
    }
    setBlocked(names);
    startTransition(() => router.refresh());
  }

  return (
    <TablesViewer
      dataSourceId={dataSourceId}
      dataSourceName={dataSourceName}
      initialSelected={blocked}
      onApply={onApply}
      triggerLabel={blocked.length > 0 ? `Blocked tables (${blocked.length})` : "Block tables"}
      triggerVariant="outline"
      dialogTitle={`${dataSourceName} · block tables`}
      dialogDescription="Tick tables to block. Anyone using this connector — via any workspace or direct grant — is refused when calling a tool against a blocked table."
      applyLabel="Save block list"
      selectionVerb="blocked"
    />
  );
}
