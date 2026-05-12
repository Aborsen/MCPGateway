export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function truncateJson(value: unknown, maxBytes = 8192): string {
  const str = JSON.stringify(value);
  if (str.length <= maxBytes) return str;
  return JSON.stringify({
    _truncated: true,
    _originalBytes: str.length,
    preview: str.slice(0, maxBytes - 100),
  });
}

export function parsePermissions(json: string): Array<"read" | "write" | "delete"> {
  const arr = safeJsonParse<unknown>(json, []);
  if (!Array.isArray(arr)) return [];
  return arr.filter((p): p is "read" | "write" | "delete" =>
    p === "read" || p === "write" || p === "delete",
  );
}

export function parseAllowedTables(json: string | null | undefined): string[] | null {
  if (json === null || json === undefined) return null;
  const arr = safeJsonParse<unknown>(json, null);
  if (!Array.isArray(arr)) return null;
  return arr.filter((t): t is string => typeof t === "string");
}
