"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layouts/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QueryLogTab } from "./query-log-tab";
import { AuditLogTab } from "./audit-log-tab";

type Option = { id: string; name: string; email?: string };

export function LogsView({
  users,
  dataSources,
}: {
  users: Option[];
  dataSources: Option[];
}) {
  const [tab, setTab] = useState("query");

  return (
    <>
      <PageHeader
        title="Logs"
        description="Query Log shows every MCP request. Audit Log shows admin actions on users and tokens."
      />
      <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col">
        <div className="border-b border-border bg-card/30 px-6">
          <TabsList className="border-b-0">
            <TabsTrigger value="query">Query Log</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="query" className="flex-1">
          <QueryLogTab users={users} dataSources={dataSources} />
        </TabsContent>
        <TabsContent value="audit" className="flex-1">
          <AuditLogTab users={users} />
        </TabsContent>
      </Tabs>
    </>
  );
}
