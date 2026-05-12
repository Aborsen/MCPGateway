"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MoreHorizontal, Trash2, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layouts/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  dataSourceCount: number;
  userCount: number;
  createdAt: string;
};

export function WorkspacesList({ initial }: { initial: Workspace[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/teams/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function onDelete(w: Workspace) {
    if (!confirm(`Delete team "${w.name}"? Users assigned to this team lose access.`)) return;
    await fetch(`/api/workspaces/${w.id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <>
      <PageHeader
        title="Teams"
        description="Group data sources, restrict tables, and assign users with read/write/delete permissions."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        }
      />

      <div className="p-6">
        {initial.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <FolderTree className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 text-sm font-medium">No teams yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a team to bundle data sources together and grant access to specific users.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {initial.map((w) => (
              <div key={w.id} className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => onDelete(w)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Link href={`/teams/${w.id}`} className="block">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{w.name}</h3>
                  </div>
                  {w.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{w.description}</p>
                  )}
                  <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                    <span>{w.dataSourceCount} data sources</span>
                    <span>{w.userCount} users</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
            <DialogDescription>
              Configure data source restrictions and user assignments on the team page after creation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Sales Team"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea
                id="ws-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
