"use client";

import { useEffect } from "react";

// Last-resort error boundary — replaces the root layout when a render error
// escapes every other error boundary. Must define <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
          gap: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Application error</h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#a1a1aa" }}>
          {error.message || "A fatal error occurred. Please refresh the page."}
        </p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#71717a" }}>Reference: {error.digest}</p>
        )}
        <button
          onClick={() => reset()}
          style={{
            padding: "0.5rem 1rem",
            background: "#fafafa",
            color: "#0a0a0a",
            border: "none",
            borderRadius: "0.375rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
