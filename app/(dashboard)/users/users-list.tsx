"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MoreHorizontal, Trash2, Pencil, Key } from "lucide-react";
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
import { UserFormDialog, type User } from "./user-form";

export function UsersList({ initial }: { initial: User[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [, startTransition] = useTransition();

  function onInvite() {
    setEditing(null);
    setOpen(true);
  }
  function onEdit(u: User) {
    setEditing(u);
    setOpen(true);
  }
  async function onDelete(u: User) {
    if (!confirm(`Remove user "${u.name}"? Their MCP tokens will stop working immediately.`)) return;
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="People who can access this AI Connectivity instance and consume MCP servers."
        actions={
          <Button onClick={onInvite}>
            <Plus className="h-4 w-4" />
            Invite User
          </Button>
        }
      />

      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Teams</th>
                <th className="px-4 py-3 font-medium">MCP Tokens</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {initial.map((u) => (
                <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/users/${u.id}`} className="font-medium text-foreground hover:text-primary">
                      {u.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.workspaceCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.tokenCount === 0 ? (
                      <Link
                        href={`/users/${u.id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Key className="h-3 w-3" />
                        Generate
                      </Link>
                    ) : (
                      `${u.tokenCount} active`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEdit(u)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onDelete(u)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UserFormDialog
        open={open}
        onOpenChange={setOpen}
        user={editing}
        onSaved={() => {
          setOpen(false);
          startTransition(() => router.refresh());
        }}
      />
    </>
  );
}
