"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Kicks off the OAuth dance by navigating the top-level window to
// /api/connections/oauth/<slug>/start. We DON'T fetch() it — the server
// responds with a 302 to the vendor's authorize endpoint and the browser
// needs to follow it as a top-level navigation so cookies are set.
export function ConnectButton({ slug, name }: { slug: string; name: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      onClick={() => {
        setPending(true);
        window.location.href = `/api/connections/oauth/${slug}/start`;
      }}
      disabled={pending}
    >
      {pending ? "Redirecting…" : `Connect with ${name}`}
    </Button>
  );
}
