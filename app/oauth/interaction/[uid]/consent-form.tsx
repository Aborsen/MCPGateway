"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Allow / Deny buttons for the OAuth consent screen. The actual Grant
// creation happens server-side in /oauth/interaction/[uid]/confirm.

export function ConsentForm({ uid }: { uid: string }) {
  const [pending, setPending] = useState<"allow" | "deny" | null>(null);

  async function submit(action: "allow" | "deny") {
    setPending(action);
    try {
      const url = action === "allow"
        ? `/oauth/interaction/${uid}/confirm`
        : `/oauth/interaction/${uid}/abort`;
      const res = await fetch(url, { method: "POST", redirect: "follow" });
      // Server replies with a redirect to /oauth/authorize/<jti>; the
      // browser will follow it automatically when we navigate to res.url.
      if (res.redirected) {
        window.location.href = res.url;
      } else if (res.ok) {
        window.location.reload();
      } else {
        alert("Authorization failed: " + res.status);
        setPending(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
      setPending(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        onClick={() => submit("allow")}
        disabled={pending !== null}
        className="flex-1"
      >
        {pending === "allow" ? "Allowing…" : "Allow"}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => submit("deny")}
        disabled={pending !== null}
        className="flex-1"
      >
        {pending === "deny" ? "Denying…" : "Deny"}
      </Button>
    </div>
  );
}
