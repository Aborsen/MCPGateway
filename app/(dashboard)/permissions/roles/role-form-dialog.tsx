"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Role, PermissionEntry } from "./roles-view";

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  catalog,
  canManage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: Role | null;
  catalog: PermissionEntry[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = role?.isSystem === true;
  const isEdit = role !== null;

  useEffect(() => {
    if (role) {
      setSlug(role.slug);
      setName(role.name);
      setDescription(role.description);
      setSelected(new Set(role.permissions));
    } else {
      setSlug("");
      setName("");
      setDescription("");
      setSelected(new Set());
    }
    setError(null);
  }, [role, open]);

  const byCategory = useMemo(() => {
    const map = new Map<string, PermissionEntry[]>();
    for (const p of catalog) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  function toggle(key: string) {
    if (readOnly) return;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  function toggleCategory(category: string, on: boolean) {
    if (readOnly) return;
    const next = new Set(selected);
    for (const p of catalog) {
      if (p.category !== category) continue;
      if (on) next.add(p.key);
      else next.delete(p.key);
    }
    setSelected(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly || !canManage) return;
    setPending(true);
    setError(null);
    try {
      const body = {
        slug,
        name,
        description,
        permissions: Array.from(selected),
      };
      const res = await fetch(role ? `/api/roles/${role.id}` : "/api/roles", {
        method: role ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? `View ${role?.name}` : isEdit ? `Edit ${role?.name}` : "Create role"}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "System role — read-only. Edit by changing the catalog in code and re-deploying."
              : "Custom role. Pick which permissions it grants."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-slug">Slug</Label>
              <Input
                id="role-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                disabled={readOnly || isEdit}
                required
                placeholder="connection-creator"
                pattern="[a-z0-9_-]+"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-name">Display name</Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={readOnly}
                required
                placeholder="Connection Creator"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              placeholder="What this role is for"
              maxLength={500}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              <span className="text-xs text-muted-foreground">
                {selected.size} / {catalog.length} selected
              </span>
            </div>
            <div className="space-y-4 rounded-md border border-border p-3">
              {byCategory.map(([category, perms]) => {
                const allOn = perms.every((p) => selected.has(p.key));
                const someOn = perms.some((p) => selected.has(p.key));
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between border-b border-border pb-1">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={allOn ? true : someOn ? "indeterminate" : false}
                          onCheckedChange={(v) => toggleCategory(category, v === true)}
                          disabled={readOnly}
                        />
                        <span className="uppercase tracking-wide text-xs">{category}</span>
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {perms.filter((p) => selected.has(p.key)).length} / {perms.length}
                      </span>
                    </div>
                    <div className="grid gap-1.5 pl-2">
                      {perms.map((p) => (
                        <label
                          key={p.key}
                          className="flex cursor-pointer items-start gap-2 rounded-sm py-1 text-sm hover:bg-muted/30"
                        >
                          <Checkbox
                            checked={selected.has(p.key)}
                            onCheckedChange={() => toggle(p.key)}
                            disabled={readOnly}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{p.key}</span>
                              {p.scopeable && (
                                <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                                  scopeable
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && canManage && (
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : isEdit ? "Save changes" : "Create role"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
