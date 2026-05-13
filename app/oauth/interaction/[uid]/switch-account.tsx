"use client";

import { useState } from "react";

// "Not you?" link on the consent screen. The interaction is at the consent
// step which means the OAuth login was already satisfied by an existing
// Auth.js session. To switch users we need to:
//
// 1. Abort the OAuth interaction (so Claude sees access_denied and stops
//    treating this as an active connect).
// 2. Sign out of Auth.js so the next /oauth/interaction request actually
//    sees "no session" and prompts for credentials.
// 3. Send the user to /login so they can sign in with the right account.
//
// After logging in they re-trigger the connect from Claude; the new
// OAuth flow then runs against their new session.

export function SwitchAccountLink({ uid }: { uid: string }) {
  const [pending, setPending] = useState(false);
  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    setPending(true);
    try {
      // Order matters: abort the OAuth flow BEFORE killing the session,
      // because the abort endpoint needs interactionDetails which reads
      // the OAuth cookie (not the Auth.js one).
      await fetch(`/oauth/interaction/${uid}/abort`, { method: "POST" }).catch(() => undefined);
      await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    } finally {
      window.location.href = "/login?switched=1";
    }
  }
  return (
    <a href="#" onClick={onClick} className="text-primary hover:underline">
      {pending ? "Signing out…" : "Not you? Sign in as someone else"}
    </a>
  );
}
