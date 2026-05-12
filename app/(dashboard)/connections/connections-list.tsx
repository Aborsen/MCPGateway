"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MoreHorizontal, Trash2, Pencil, ExternalLink, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layouts/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConnectionFormDialog, type Connection } from "./connection-form";

export type { Connection };

const TYPE_COLORS: Record<string, string> = {
  jira: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  zoho: "bg-red-500/20 text-red-400 border-red-500/40",
  hubspot: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  salesforce: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  postgres: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
};

export function ConnectionsList({ initial }: { initial: Connection[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [, startTransition] = useTransition();

  function onAdd() {
    setEditing(null);
    setOpen(true);
  }

  function onEdit(c: Connection) {
    setEditing(c);
    setOpen(true);
  }

  async function onDelete(c: Connection) {
    if (!confirm(`Delete connection "${c.name}"? This removes its tool permissions and workspace assignments.`)) return;
    await fetch(`/api/connections/${c.id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <>
      <PageHeader
        title="Connections"
        description="MCP data sources. Each one proxies to an upstream MCP server."
        actions={
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        }
      />

      <div className="p-6">
        {initial.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <Database className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-medium">No connections yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add an upstream MCP server to expose it through AI Connectivity.
            </p>
            <Button onClick={onAdd} className="mt-4">
              <Plus className="h-4 w-4" />
              Add Connection
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Upstream URL</th>
                  <th className="px-4 py-3 font-medium">Tools</th>
                  <th className="px-4 py-3 font-medium">Workspaces</th>
                  <th className="w-12 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {initial.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/connections/${c.id}`} className="font-medium text-foreground hover:text-primary">
                        {c.name}
                      </Link>
                      {c.description && (
                        <div className="text-xs text-muted-foreground">{c.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={TYPE_COLORS[c.type] ?? ""}>
                        {c.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <a
                        href={c.upstreamUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.upstreamUrl.length > 40 ? `${c.upstreamUrl.slice(0, 40)}…` : c.upstreamUrl}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.toolCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.workspaceCount}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onEdit(c)}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => onDelete(c)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConnectionFormDialog
        open={open}
        onOpenChange={setOpen}
        connection={editing}
        onSaved={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
      />
    </>
  );
}
