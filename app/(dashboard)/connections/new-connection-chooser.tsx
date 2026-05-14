"use client";

import { useRouter } from "next/navigation";
import { LayoutGrid, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Two-option chooser shown when the admin clicks "Add Connection".
// One option preserves the existing "paste your own MCP URL" form;
// the other navigates to the curated catalog at /connections/new/catalog.
//
// We keep the existing ConnectionFormDialog reachable via this chooser
// rather than replacing it — so the manual flow is unchanged.
export function NewConnectionChooser({
  open,
  onOpenChange,
  onPickCustom,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPickCustom: () => void;
}) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a connection</DialogTitle>
          <DialogDescription>
            Pick a vendor from the catalog, or wire up an existing MCP server URL.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              router.push("/connections/new/catalog");
            }}
            className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-accent/30"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="font-medium">Create connection</div>
              <div className="text-xs text-muted-foreground">
                Pick from a catalog of common SaaS apps and databases. We handle the
                upstream MCP setup for you.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onPickCustom();
            }}
            className="group flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-accent/30"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Link2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="font-medium">Existing MCP URL</div>
              <div className="text-xs text-muted-foreground">
                You already have an upstream MCP server. Paste its URL and any auth headers.
              </div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
