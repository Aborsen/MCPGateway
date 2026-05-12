import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function ChatPage() {
  return (
    <>
      <PageHeader
        title="AI Chat"
        description="In-app chat against your data sources, with audit logging."
      />
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Coming in v2</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              For now, paste your MCP URL into Claude Code and chat with your data sources there. Every
              call lands in the Audit Log.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
