import { Button } from "@/components/ui/button";

// Native form POST — the browser handles the OAuth redirect chain natively
// across origins (back to claude.ai's callback). Using fetch() here would
// hit a CORS gate when the chain crosses origins and throw "Failed to fetch".
//
// Allow form posts to /oauth/interaction/[uid]/confirm
// Deny  form posts to /oauth/interaction/[uid]/abort

export function ConsentForm({ uid }: { uid: string }) {
  return (
    <div className="flex gap-2">
      <form action={`/oauth/interaction/${uid}/confirm`} method="POST" className="flex-1">
        <Button type="submit" className="w-full">
          Allow
        </Button>
      </form>
      <form action={`/oauth/interaction/${uid}/abort`} method="POST" className="flex-1">
        <Button type="submit" variant="outline" className="w-full">
          Deny
        </Button>
      </form>
    </div>
  );
}
