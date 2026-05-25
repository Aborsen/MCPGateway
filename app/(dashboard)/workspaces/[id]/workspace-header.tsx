"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Inline-editable workspace header. Replaces the standard PageHeader for
// the workspace detail page so admins don't have to scroll to a separate
// "Details" card just to rename a workspace or tweak its description.
// Click the title or the description to edit; Enter (or blur) saves;
// Escape cancels. PATCH /api/workspaces/[id] is gated on workspaces.update,
// so we only enable the click behaviour when canEdit is true.

export function WorkspaceHeader({
  workspaceId,
  initialName,
  initialDescription,
  canEdit,
}: {
  workspaceId: string;
  initialName: string;
  initialDescription: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  // Re-sync if the server refresh delivers new values (e.g. another tab
  // saved while we were viewing). useState only initialises once, so a
  // controlled effect is required.
  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => setDescription(initialDescription ?? ""), [initialDescription]);

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <EditableTitle
          value={name}
          canEdit={canEdit}
          onCommit={async (v) => {
            const trimmed = v.trim();
            if (!trimmed || trimmed === name) {
              setName(name); // revert to last good
              return;
            }
            const ok = await save(workspaceId, { name: trimmed });
            if (ok) {
              setName(trimmed);
              router.refresh();
            }
          }}
        />
        <EditableDescription
          value={description}
          canEdit={canEdit}
          onCommit={async (v) => {
            const trimmed = v.trim();
            if (trimmed === description) return;
            const ok = await save(workspaceId, { description: trimmed || null });
            if (ok) {
              setDescription(trimmed);
              router.refresh();
            }
          }}
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/workspaces"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to workspaces
        </Link>
      </div>
    </div>
  );
}

async function save(
  workspaceId: string,
  body: { name?: string; description?: string | null },
): Promise<boolean> {
  const res = await fetch(`/api/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error ?? `Save failed (${res.status})`);
    return false;
  }
  return true;
}

function EditableTitle({
  value,
  canEdit,
  onCommit,
}: {
  value: string;
  canEdit: boolean;
  onCommit: (next: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      // focus + select-all on next tick after Input mounts
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  function commit() {
    setEditing(false);
    startTransition(() => {
      void onCommit(draft);
    });
  }
  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setEditing(true)}
        title={canEdit ? "Click to rename" : undefined}
        className={cn(
          "group inline-flex items-center gap-2 text-left text-xl font-semibold text-foreground",
          canEdit && "hover:text-primary",
          !canEdit && "cursor-default",
        )}
      >
        <span>{value}</span>
        {canEdit && (
          <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      disabled={pending}
      className="h-9 max-w-md text-xl font-semibold"
    />
  );
}

function EditableDescription({
  value,
  canEdit,
  onCommit,
}: {
  value: string;
  canEdit: boolean;
  onCommit: (next: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      queueMicrotask(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
    }
  }, [editing, value]);

  function commit() {
    setEditing(false);
    startTransition(() => {
      void onCommit(draft);
    });
  }
  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    const placeholder = canEdit ? "Click to add a description…" : "";
    const display = value || placeholder;
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setEditing(true)}
        title={canEdit ? "Click to edit description" : undefined}
        className={cn(
          "group inline-flex max-w-3xl items-start gap-2 text-left text-sm text-muted-foreground",
          canEdit && "hover:text-foreground",
          !canEdit && "cursor-default",
          !value && "italic",
        )}
      >
        <span className="line-clamp-2">{display || "—"}</span>
        {canEdit && (
          <Pencil className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
        )}
      </button>
    );
  }

  return (
    <Textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        // Ctrl+Enter or plain Enter (no Shift) commits; Shift+Enter inserts
        // a newline. Esc cancels. Plain Enter commit is the same as the
        // title — keeps the keyboard model consistent.
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      disabled={pending}
      rows={2}
      placeholder="Optional"
      className="max-w-3xl text-sm"
    />
  );
}
