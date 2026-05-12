"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type Connection = {
  id: string;
  name: string;
  slug: string;
  type: string;
  upstreamUrl: string;
  description: string | null;
  toolCount: number;
  workspaceCount: number;
  createdAt: string;
};

const KNOWN_TYPES = [
  { value: "jira", label: "Jira" },
  { value: "zoho", label: "Zoho CRM" },
  { value: "hubspot", label: "HubSpot" },
  { value: "salesforce", label: "Salesforce" },
  { value: "postgres", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "rest", label: "Generic REST/MCP" },
];

type AuthScheme = "bearer" | "customHeaders" | "none";

type HeaderRow = { id: string; name: string; value: string };

function rid() {
  return Math.random().toString(36).slice(2);
}

export function ConnectionFormDialog({
  open,
  onOpenChange,
  connection,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connection: Connection | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState("jira");
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [description, setDescription] = useState("");
  const [authScheme, setAuthScheme] = useState<AuthScheme>("bearer");
  const [apiKey, setApiKey] = useState("");
  const [headers, setHeaders] = useState<HeaderRow[]>([{ id: rid(), name: "", value: "" }]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setSlug(connection.slug);
      setType(connection.type);
      setUpstreamUrl(connection.upstreamUrl);
      setDescription(connection.description ?? "");
    } else {
      setName("");
      setSlug("");
      setType("jira");
      setUpstreamUrl("");
      setDescription("");
    }
    setAuthScheme("bearer");
    setApiKey("");
    setHeaders([{ id: rid(), name: "", value: "" }]);
    setError(null);
  }, [connection, open]);

  function addHeader() {
    setHeaders([...headers, { id: rid(), name: "", value: "" }]);
  }
  function removeHeader(id: string) {
    setHeaders(headers.filter((h) => h.id !== id));
  }
  function updateHeader(id: string, field: "name" | "value", value: string) {
    setHeaders(headers.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const url = connection ? `/api/connections/${connection.id}` : "/api/connections";
      const method = connection ? "PATCH" : "POST";

      const customHeaders: Record<string, string> = {};
      for (const h of headers) {
        const n = h.name.trim();
        if (!n) continue;
        if (!/^[A-Za-z0-9-]+$/.test(n)) throw new Error(`Invalid header name "${n}"`);
        customHeaders[n] = h.value;
      }

      const authPayload =
        authScheme === "bearer"
          ? { authScheme: "bearer" as const, apiKey: apiKey || undefined }
          : authScheme === "customHeaders"
            ? { authScheme: "customHeaders" as const, customHeaders }
            : { authScheme: "none" as const };

      const body = connection
        ? { name, type, upstreamUrl, description: description || null, ...authPayload }
        : {
            name,
            slug,
            type,
            upstreamUrl,
            description: description || null,
            ...authPayload,
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{connection ? "Edit connection" : "Add connection"}</DialogTitle>
          <DialogDescription>
            Configure an upstream MCP server. Credentials are encrypted with libsodium.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="My Jira Cloud"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                required={!connection}
                disabled={!!connection}
                placeholder="my-jira"
                pattern="^[a-z0-9-]+$"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KNOWN_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upstream">Upstream MCP URL</Label>
            <Input
              id="upstream"
              type="url"
              value={upstreamUrl}
              onChange={(e) => setUpstreamUrl(e.target.value)}
              required
              placeholder="https://mcp.example.com/jira"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Authentication</Label>
            <Select value={authScheme} onValueChange={(v) => setAuthScheme(v as AuthScheme)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bearer">Bearer token (Authorization)</SelectItem>
                <SelectItem value="customHeaders">Custom headers</SelectItem>
                <SelectItem value="none">No authentication</SelectItem>
              </SelectContent>
            </Select>

            {authScheme === "bearer" && (
              <div className="space-y-1">
                <Label htmlFor="apiKey" className="text-xs">
                  Bearer token {connection && "(leave blank to keep existing)"}
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-... or your token"
                  autoComplete="off"
                />
              </div>
            )}

            {authScheme === "customHeaders" && (
              <div className="space-y-2">
                <Label className="text-xs">
                  Headers sent on every upstream request
                  {connection && " (will replace existing)"}
                </Label>
                {headers.map((h) => (
                  <div key={h.id} className="flex items-center gap-2">
                    <Input
                      value={h.name}
                      onChange={(e) => updateHeader(h.id, "name", e.target.value)}
                      placeholder="X-API-Key"
                      pattern="^[A-Za-z0-9-]+$"
                      className="font-mono text-xs"
                    />
                    <Input
                      type="password"
                      value={h.value}
                      onChange={(e) => updateHeader(h.id, "value", e.target.value)}
                      placeholder="value"
                      autoComplete="off"
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeHeader(h.id)}
                      disabled={headers.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addHeader}>
                  <Plus className="h-3 w-3" />
                  Add header
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Reserved headers (Content-Type, Accept, Authorization, Mcp-Session-Id) are stripped server-side.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : connection ? "Save changes" : "Add connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
