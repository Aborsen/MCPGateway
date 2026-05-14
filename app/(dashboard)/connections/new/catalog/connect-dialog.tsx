"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { AdvancedSettingDef, CatalogEntry } from "@/lib/connector-catalog";
import { useOAuthPopup } from "@/lib/hooks/use-oauth-popup";

// "Connect to <vendor>" modal. Mirrors the Devart Skyvia flow:
//   - Connection name (defaults to vendor name).
//   - Access token field — fillable by paste (PAT) or by clicking the
//     "Sign In with <vendor>" button (opens an OAuth popup).
//   - Advanced settings collapsed by default. Each adapter declares its
//     own settings shape; the dialog renders them generically.
//   - Continue button POSTs /api/connections/from-catalog and routes to
//     the new connection's detail page on success.

type Props = {
  entry: CatalogEntry | null;
  open: boolean;
  oauthConfigured: boolean;
  onOpenChange: (v: boolean) => void;
};

type FormState = {
  name: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  extras: Record<string, string>;
  advanced: Record<string, string | boolean>;
};

function emptyFormFor(entry: CatalogEntry | null): FormState {
  const advanced: Record<string, string | boolean> = {};
  for (const def of entry?.advancedSettings ?? []) {
    if (def.kind === "boolean") advanced[def.key] = def.default ?? false;
    else if (def.kind === "select") advanced[def.key] = def.default ?? def.options[0]?.value ?? "";
    else advanced[def.key] = def.default ?? "";
  }
  return {
    name: entry?.name ?? "",
    accessToken: "",
    refreshToken: undefined,
    expiresAt: undefined,
    extras: {},
    advanced,
  };
}

export function ConnectDialog({ entry, open, oauthConfigured, onOpenChange }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => emptyFormFor(entry));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever a different entry is opened. (The dialog reuses
  // the same component when the user closes -> reopens for a new vendor.)
  useEffect(() => {
    setForm(emptyFormFor(entry));
    setShowAdvanced(false);
    setShowToken(false);
    setError(null);
  }, [entry, open]);

  const popupCallback = useCallback(
    (msg: Parameters<Parameters<typeof useOAuthPopup>[0]>[0]) => {
      if (msg.type === "mcpgw-oauth-error") {
        setError(`OAuth failed: ${msg.error}`);
        return;
      }
      setForm((f) => ({
        ...f,
        accessToken: msg.accessToken,
        refreshToken: msg.refreshToken,
        expiresAt: msg.expiresIn !== undefined ? Date.now() + msg.expiresIn * 1000 : undefined,
        extras: { ...f.extras, ...(msg.extra ?? {}) },
      }));
      setError(null);
    },
    [],
  );

  const oauthPopup = useOAuthPopup(popupCallback);

  const isOAuth = entry?.auth?.kind === "oauth";
  const allowsPaste = entry?.supportsPat ?? isOAuth;
  const hint = useMemo(() => {
    if (entry?.patHint) return entry.patHint;
    if (isOAuth) return `Click "Sign In with ${entry?.name}" to populate this via OAuth.`;
    return "";
  }, [entry, isOAuth]);

  async function onSubmit() {
    if (!entry) return;
    setPending(true);
    setError(null);
    try {
      // Merge dialog-side advanced settings with vendor-supplied OAuth
      // extras (e.g. Salesforce instance_url). Vendor extras win — they
      // describe the actual auth target.
      const advancedSettings = { ...form.advanced, ...form.extras };
      const res = await fetch("/api/connections/from-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: entry.slug,
          name: form.name.trim() || entry.name,
          accessToken: form.accessToken,
          refreshToken: form.refreshToken,
          expiresAt: form.expiresAt,
          advancedSettings,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const { id } = (await res.json()) as { id: string };
      onOpenChange(false);
      router.push(`/connections/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setPending(false);
    }
  }

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div
              className={
                "flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold " +
                entry.badge.classes
              }
            >
              {entry.badge.label}
            </div>
            <span>Connect to {entry.name}</span>
          </DialogTitle>
          <DialogDescription>{entry.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="conn-name">Connection name</Label>
            <Input
              id="conn-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={entry.name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="access-token">Access Token</Label>
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <Input
                  id="access-token"
                  type={showToken ? "text" : "password"}
                  value={form.accessToken}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      accessToken: e.target.value,
                      // A manual paste/edit invalidates any stashed refresh
                      // token from a previous OAuth dance — we don't want
                      // to persist a mismatched access+refresh pair.
                      refreshToken: undefined,
                      expiresAt: undefined,
                    })
                  }
                  readOnly={!allowsPaste}
                  placeholder={allowsPaste ? "Paste a token, or use the button →" : "Use the button →"}
                  autoComplete="off"
                  className="pr-9 font-mono text-xs"
                />
                {form.accessToken && (
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showToken ? "Hide token" : "Show token"}
                  >
                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              {isOAuth && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => oauthPopup.open(entry.slug)}
                  disabled={!oauthConfigured || oauthPopup.pending}
                  title={
                    !oauthConfigured
                      ? "OAuth client credentials not configured for this vendor."
                      : undefined
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {oauthPopup.pending ? "Waiting…" : `Sign In with ${entry.name}`}
                </Button>
              )}
            </div>
            {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
            {!oauthConfigured && isOAuth && (
              <p className="text-[11px] text-amber-400">
                Set <code className="font-mono">CONNECTOR_OAUTH_{entry.auth && entry.auth.kind === "oauth" ? entry.auth.provider.replace(/-/g, "_").toUpperCase() : ""}_CLIENT_ID/_SECRET</code>{" "}
                in Vercel to enable OAuth.{entry.supportsPat ? " You can still paste a PAT above." : ""}
              </p>
            )}
          </div>

          {entry.advancedSettings && entry.advancedSettings.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Advanced Settings
              </button>
              {showAdvanced && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  {entry.advancedSettings.map((def) => (
                    <AdvancedSettingField
                      key={def.key}
                      def={def}
                      value={form.advanced[def.key]}
                      onChange={(v) =>
                        setForm({ ...form, advanced: { ...form.advanced, [def.key]: v } })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending || form.accessToken.length === 0}>
            {pending ? "Creating…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvancedSettingField({
  def,
  value,
  onChange,
}: {
  def: AdvancedSettingDef;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  if (def.kind === "boolean") {
    return (
      <div className="flex items-start gap-2">
        <Checkbox
          id={`adv-${def.key}`}
          checked={Boolean(value)}
          onCheckedChange={(c) => onChange(Boolean(c))}
        />
        <div className="flex-1 space-y-0.5">
          <Label htmlFor={`adv-${def.key}`} className="text-sm font-medium">
            {def.label}
          </Label>
          {def.help && <p className="text-[11px] text-muted-foreground">{def.help}</p>}
        </div>
      </div>
    );
  }
  if (def.kind === "select") {
    return (
      <div className="space-y-1">
        <Label htmlFor={`adv-${def.key}`}>{def.label}</Label>
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger id={`adv-${def.key}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {def.help && <p className="text-[11px] text-muted-foreground">{def.help}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label htmlFor={`adv-${def.key}`}>{def.label}</Label>
      <Input
        id={`adv-${def.key}`}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        className="font-mono text-xs"
      />
      {def.help && <p className="text-[11px] text-muted-foreground">{def.help}</p>}
    </div>
  );
}
