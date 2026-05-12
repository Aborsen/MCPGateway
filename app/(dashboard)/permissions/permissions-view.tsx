"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Users, Plug, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { MatrixPayload } from "./permissions-types";
import { ByUserView } from "./by-user-view";
import { ByConnectionView } from "./by-connection-view";
import { MatrixView } from "./matrix-view";

export function PermissionsView() {
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("by-user");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/permissions", { cache: "no-store" });
      const payload = await res.json();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card/30 px-6">
        <TabsList className="border-b-0">
          <TabsTrigger value="by-user">
            <Users className="h-3.5 w-3.5" />
            By User
          </TabsTrigger>
          <TabsTrigger value="by-connection">
            <Plug className="h-3.5 w-3.5" />
            By Connection
          </TabsTrigger>
          <TabsTrigger value="matrix">
            <LayoutGrid className="h-3.5 w-3.5" />
            Matrix
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {data && (
            <span>
              {data.users.length} user{data.users.length === 1 ? "" : "s"} ·{" "}
              {data.dataSources.length} connection{data.dataSources.length === 1 ? "" : "s"}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <TabsContent value="by-user" className="flex-1">
        {data ? <ByUserView data={data} onChange={load} /> : <LoadingPane />}
      </TabsContent>
      <TabsContent value="by-connection" className="flex-1">
        {data ? <ByConnectionView data={data} onChange={load} /> : <LoadingPane />}
      </TabsContent>
      <TabsContent value="matrix" className="flex-1">
        {data ? <MatrixView data={data} onChange={load} /> : <LoadingPane />}
      </TabsContent>
    </Tabs>
  );
}

function LoadingPane() {
  return <div className="px-6 py-12 text-center text-muted-foreground">Loading…</div>;
}
