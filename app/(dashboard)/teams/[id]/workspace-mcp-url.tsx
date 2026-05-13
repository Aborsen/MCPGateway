"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, RefreshCcw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

// Workspace-scoped MCP URL. Any user assigned to the workspace can use it —
// after OAuth, the proxy confirms membership and applies the workspace's
// permission set (not the user's full grant set).

export function WorkspaceMcpUrl({
  workspaceId,
  initialMcpUid,
}: {
  workspaceId: string;
  initialMcpUid: string | null;
}) {
  const router = useRouter();
  const [mcpUid, setMcpUid] = useState<string | null>(initialMcpUid);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  const url = mcpUid ? `${origin()}/api/mcp/w/${mcpUid}` : null;

  async function onGenerateOrRotate() {
    if (mcpUid && !confirm("Rotate URL? The old URL stops working immediately — every workspace member will need to re-add the new URL in Claude.")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/tokens`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMcpUid(data.mcpUid);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {!url && (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <KeyRound className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No workspace MCP URL generated yet. Any user assigned to this workspace can use
            the URL after signing in with their own credentials.
          </p>
          <Button onClick={onGenerateOrRotate} disabled={pending} className="mt-3">
            {pending ? "Generating…" : "Generate URL"}
          </Button>
        </div>
      )}

      {url && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <pre className="flex-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{url}</pre>
            <Button variant="outline" size="sm" onClick={() => copy(url)}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Shareable with every workspace member. Each member signs in via OAuth with
              their own AI Connectivity credentials.
            </span>
            <Button variant="ghost" size="sm" onClick={onGenerateOrRotate} disabled={pending}>
              <RefreshCcw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
              {pending ? "Rotating…" : "Rotate URL"}
            </Button>
          </div>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Show .mcp.json snippet</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono">
{`{
  "mcpServers": {
    "ai-connectivity": {
      "url": "${url}"
    }
  }
}`}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function origin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
