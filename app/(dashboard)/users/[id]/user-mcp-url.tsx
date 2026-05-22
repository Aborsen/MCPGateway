"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Generic MCP endpoint shown verbatim. The URL itself isn't a secret — auth
// happens via OAuth on first connect — so there's no rotate/regenerate flow.
// The same URL is used by every user; their bearer token determines whose
// permissions apply.

export function UserMcpUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const snippet = `{
  "mcpServers": {
    "mcp-gateway": {
      "url": "${url}"
    }
  }
}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <pre className="flex-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
          {url}
        </pre>
        <Button variant="outline" size="sm" onClick={() => copy(url)}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The URL is the same for every user — not a secret. On first connect, the user signs in via
        OAuth with their MCP Gateway credentials, and the bearer token determines whose permissions
        apply.
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Show .mcp.json snippet</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono">{snippet}</pre>
      </details>
    </div>
  );
}
