import { PageHeader } from "@/components/layouts/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader
        title="Users"
        description="People who can access this MCP Gateway instance and consume MCP servers."
      />
      <div className="space-y-4 p-6">
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-9 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2 rounded-lg border border-border p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-2 py-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
