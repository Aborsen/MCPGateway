"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  initialName: string;
  email: string;
};

export function SettingsView({ initialName, email }: Props) {
  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSaveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setNameMsg({ kind: "ok", text: "Saved. Refresh to see updated name in the sidebar." });
    } catch (err) {
      setNameMsg({ kind: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setSavingName(false);
    }
  }

  async function onSignOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      <PageHeader title="Settings" description="Your profile, appearance, and account." />
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Edit your display name. Email is read-only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveName} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-name">Name</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input id="settings-email" value={email} disabled />
              </div>
              {nameMsg && (
                <p className={cn("text-sm", nameMsg.kind === "ok" ? "text-success" : "text-destructive")}>
                  {nameMsg.text}
                </p>
              )}
              <Button type="submit" disabled={savingName || name === initialName}>
                {savingName ? "Saving…" : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Switch between light, dark, or follow your system.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeSelector />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Sign out of this session.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options: { value: string; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: Monitor },
  ];

  const current = mounted ? theme ?? "system" : "system";

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(({ value, label, Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-md border p-4 text-sm transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
