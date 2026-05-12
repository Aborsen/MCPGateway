"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type TokenRow = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function UserTokens({ userId, initial }: { userId: string; initial: TokenRow[] }) {
  const router = useRouter();
  const [tokens, setTokens] = useState(initial);
  const [newSecret, setNewSecret] = useState<{ url: string; token: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  async function onGenerate() {
    const label = prompt("Optional label (e.g. 'MacBook'):");
    setPending(true);
    try {
      const res = await fetch(`/api/users/${userId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setTokens([{ id: data.id, label: data.label, createdAt: data.createdAt, lastUsedAt: null, revokedAt: null }, ...tokens]);
      setNewSecret({ url: data.url, token: data.token });
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function onRevoke(tokenId: string) {
    if (!confirm("Revoke this token? Claude Code using this URL will lose access immediately.")) return;
    await fetch(`/api/users/${userId}/tokens/${tokenId}`, { method: "DELETE" });
    setTokens(tokens.map((t) => (t.id === tokenId ? { ...t, revokedAt: new Date().toISOString() } : t)));
    startTransition(() => router.refresh());
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onGenerate} disabled={pending}>
          <Plus className="h-4 w-4" />
          Generate MCP URL
        </Button>
      </div>

      {newSecret && (
        <div className="rounded-md border border-primary/40 bg-primary/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Token created</p>
              <p className="text-xs text-muted-foreground">
                Copy this URL now — you won&apos;t see it again. The token itself is stored as a hash.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => copy(newSecret.url)}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono text-xs">{newSecret.url}</pre>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Show .mcp.json snippet</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono">
{`{
  "mcpServers": {
    "ai-connectivity": {
      "url": "${newSecret.url}"
    }
  }
}`}
            </pre>
          </details>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens yet. Generate one to give this user MCP access.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Label</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Last used</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="w-12 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2">{t.label ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {t.revokedAt ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!t.revokedAt && (
                      <Button variant="ghost" size="icon" onClick={() => onRevoke(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
