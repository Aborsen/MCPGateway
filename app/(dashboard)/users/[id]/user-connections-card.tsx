import Link from "next/link";
import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Connections this user can use via MCP. Built server-side by taking every
// connector attached to a workspace the user belongs to PLUS any direct
// grants (UserDataSourceAccess). Each row collapses multiple sources for
// the same connector and annotates where the access comes from.

export type ConnectionAccess = {
  dataSourceId: string;
  dataSourceName: string;
  dataSourceType: string;
  // Each entry is one path that grants this connector to the user.
  sources: {
    kind: "workspace" | "direct";
    workspaceId?: string;
    workspaceName?: string;
    permissions: string[];
  }[];
};

export function UserConnectionsCard({
  connections,
}: {
  connections: ConnectionAccess[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
        <CardDescription>
          Connectors this user can use via MCP. Access comes through workspace memberships and/or direct grants.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No connector access yet. Assign the user to a workspace that includes connectors, or grant them direct access from the Permissions page.
          </p>
        ) : (
          <ul className="space-y-2">
            {connections.map((c) => (
              <li
                key={c.dataSourceId}
                className="rounded-md border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/connections/${c.dataSourceId}`}
                    className="inline-flex items-center gap-2 font-medium hover:text-primary"
                  >
                    <Plug className="h-3.5 w-3.5 text-muted-foreground" />
                    {c.dataSourceName}
                  </Link>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {c.dataSourceType}
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {c.sources.map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-1.5">
                      {s.kind === "workspace" && s.workspaceId ? (
                        <Link
                          href={`/workspaces/${s.workspaceId}`}
                          className="hover:text-primary"
                        >
                          via {s.workspaceName}
                        </Link>
                      ) : (
                        <span className="italic">direct grant</span>
                      )}
                      <span className="text-border">·</span>
                      <div className="flex gap-1">
                        {s.permissions.length === 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            no perms
                          </Badge>
                        ) : (
                          s.permissions.map((p) => (
                            <Badge
                              key={p}
                              variant="outline"
                              className="text-[10px] uppercase"
                            >
                              {p}
                            </Badge>
                          ))
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
