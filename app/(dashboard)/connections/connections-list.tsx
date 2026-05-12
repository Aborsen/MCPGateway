"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  ExternalLink,
  Database,
  Search,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layouts/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [, startTransition] = useTransition();

  const types = useMemo(
    () => Array.from(new Set(initial.map((c) => c.type))).sort(),
    [initial],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return initial.filter((c) => {
      if (s) {
        const hay = `${c.name} ${c.slug} ${c.description ?? ""} ${c.upstreamUrl}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (usageFilter === "used" && c.workspaceCount === 0) return false;
      if (usageFilter === "unused" && c.workspaceCount > 0) return false;
      return true;
    });
  }, [initial, search, typeFilter, usageFilter]);

  function onAdd() {
    setEditing(null);
    setOpen(true);
  }

  function onEdit(c: Connection) {
    setEditing(c);
    setOpen(true);
  }

  function onViewDetails(c: Connection) {
    router.push(`/connections/${c.id}`);
  }

  async function onDelete(c: Connection) {
    if (
      !confirm(
        `Delete connection "${c.name}"? This removes its tool permissions and workspace assignments.`,
      )
    )
      return;
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

      {initial.length === 0 ? (
        <div className="p-6">
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
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card/30 px-6 py-3">
            <div className="relative min-w-[260px] flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, slug, URL…"
                className="h-9 pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={usageFilter} onValueChange={setUsageFilter}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any usage</SelectItem>
                <SelectItem value="used">In a workspace</SelectItem>
                <SelectItem value="unused">Not used</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-muted-foreground">
              {filtered.length} of {initial.length}
              {(search || typeFilter !== "all" || usageFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearch("");
                    setTypeFilter("all");
                    setUsageFilter("all");
                  }}
                  className="ml-3 text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                No connections match your filters.
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
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link
                            href={`/connections/${c.id}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
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
                            {c.upstreamUrl.length > 40
                              ? `${c.upstreamUrl.slice(0, 40)}…`
                              : c.upstreamUrl}
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
                              <DropdownMenuItem onSelect={() => onViewDetails(c)}>
                                <Info className="h-4 w-4" />
                                View details
                              </DropdownMenuItem>
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
        </>
      )}

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
