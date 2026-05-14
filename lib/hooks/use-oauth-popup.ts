"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Hook that opens an OAuth popup at /api/connections/oauth/<slug>/start
// and listens for the postMessage event posted by the callback page once
// the dance completes. The dialog uses this to populate its access-token
// field without the user ever leaving the page.

export type OAuthResult = {
  type: "mcpgw-oauth-result";
  slug: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  extra?: Record<string, string>;
};

export type OAuthError = {
  type: "mcpgw-oauth-error";
  slug: string;
  error: string;
};

type Message = OAuthResult | OAuthError;

export function useOAuthPopup(onMessage: (msg: Message) => void) {
  const [pending, setPending] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // We re-bind a fresh listener for every dance so closures stay clean.
  // Same-origin only — postMessage from any other origin is ignored.
  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as unknown;
      if (!data || typeof data !== "object") return;
      const msg = data as { type?: unknown };
      if (
        msg.type !== "mcpgw-oauth-result" &&
        msg.type !== "mcpgw-oauth-error"
      ) {
        return;
      }
      setPending(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onMessage(data as Message);
    }
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [onMessage]);

  const open = useCallback((slug: string) => {
    // Pre-close any stale popup so we don't pile up if the user
    // double-clicks.
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    const popup = window.open(
      `/api/connections/oauth/${encodeURIComponent(slug)}/start`,
      "mcpgw-oauth",
      "width=520,height=720,menubar=no,toolbar=no,location=no,status=no",
    );
    popupRef.current = popup;
    if (!popup) {
      onMessage({
        type: "mcpgw-oauth-error",
        slug,
        error: "popup_blocked",
      });
      return;
    }
    setPending(true);
    // Detect "user closed the popup without authorizing" so we don't sit
    // in pending forever.
    intervalRef.current = setInterval(() => {
      if (popup.closed) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setPending((wasPending) => {
          if (wasPending) {
            onMessage({ type: "mcpgw-oauth-error", slug, error: "popup_closed" });
          }
          return false;
        });
      }
    }, 500);
  }, [onMessage]);

  return { open, pending };
}
