// Run: npx tsx scripts/probe-upstream.ts <upstreamUrl>
const url = process.argv[2] ?? "https://mcp.skyvia.com/o7ekjdj7";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`  ${label}: OK in ${Date.now() - start}ms`);
    return result;
  } catch (e) {
    console.log(`  ${label}: FAILED in ${Date.now() - start}ms — ${e instanceof Error ? e.message : e}`);
    throw e;
  }
}

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

async function main() {
  console.log(`Probing ${url}`);

  // Step 1: initialize
  const initRes = await timed("initialize fetch", () =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "probe", version: "1" },
        },
      }),
    }),
  );
  console.log(`  status=${initRes.status}, content-type=${initRes.headers.get("content-type")}`);
  const sessionId = initRes.headers.get("Mcp-Session-Id");
  console.log(`  Mcp-Session-Id: ${sessionId ?? "(none)"}`);
  const initText = await timed("initialize read body", () => initRes.text());
  console.log(`  body preview: ${initText.slice(0, 150)}...`);
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  // Step 2: notifications/initialized
  const notifRes = await timed("notifications/initialized fetch", () =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }),
  );
  console.log(`  status=${notifRes.status}`);
  await timed("notifications/initialized read body", () => notifRes.text());

  // Step 3: tools/list
  const listRes = await timed("tools/list fetch", () =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    }),
  );
  console.log(`  status=${listRes.status}, content-type=${listRes.headers.get("content-type")}`);
  const listText = await timed("tools/list read body", () => listRes.text());
  console.log(`  body length: ${listText.length}`);
  console.log(`  body preview: ${listText.slice(0, 300)}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
