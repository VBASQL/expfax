# Task 45 — Live Status Page with SSE

## Goal
Build the live status view showing real-time fax send/receive progress via Server-Sent Events.

## Files to Create
- `src/app/(portal)/status/page.tsx`
- `src/app/api/sse/status/route.ts`

## Dependencies
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Design (from design doc section 7.5)
- Real-time status updates via SSE
- Progress indication (pages transferred vs total)
- Ability to abort in-progress sends via AbortMessage
- Auto-refresh, moves to Sent Items on completion

## Implementation

### 1. Create `src/app/api/sse/status/route.ts`

```typescript
import { NextRequest } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const { valid, user } = await validateSession();
  if (!valid || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll Cosmos every 5 seconds for active faxes
      const poll = async () => {
        try {
          const container = await containers.faxMessages();
          const { resources } = await container.items
            .query({
              query: "SELECT c.id, c.status, c.recipients, c.subject, c.submitTime, c.documents FROM c WHERE c.userId = @uid AND c.status IN ('queued', 'sending') AND c.isDeleted = false ORDER BY c.submitTime DESC",
              parameters: [{ name: "@uid", value: user.id }],
            })
            .fetchAll();

          sendEvent({ type: "status_update", activeFaxes: resources });
        } catch (error) {
          console.error("SSE poll error:", error);
        }
      };

      // Send initial data
      await poll();

      // Poll every 5 seconds
      const interval = setInterval(poll, 5000);

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### 2. Create `src/app/(portal)/status/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, Phone } from "lucide-react";

interface ActiveFax {
  id: string;
  subject: string;
  status: string;
  submitTime: string;
  recipients: Array<{
    name: string;
    faxNumber: string;
    pagesTransferred: number;
    pageCount: number;
  }>;
  documents: Array<{ pageCount: number }>;
}

export default function LiveStatusPage() {
  const [activeFaxes, setActiveFaxes] = useState<ActiveFax[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource("/api/sse/status");

    eventSource.onopen = () => setConnected(true);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "status_update") {
        setActiveFaxes(data.activeFaxes);
      }
    };
    eventSource.onerror = () => setConnected(false);

    return () => eventSource.close();
  }, []);

  async function handleAbort(id: string) {
    if (!confirm("Abort this fax?")) return;
    await fetch(`/api/fax/${id}/abort`, { method: "POST" });
  }

  // Split into active (sending) vs queued
  const sendingFaxes = activeFaxes.filter((f) => f.status === "sending");
  const queuedFaxes = activeFaxes.filter((f) => f.status === "queued");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live Status</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
          <span className="text-xs text-slate-400">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {activeFaxes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-slate-400">No faxes currently in progress</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Active Transmissions ── */}
          {sendingFaxes.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-sm">⚡ Live Transmissions</p>
                  <span className="text-xs text-emerald-600">● {sendingFaxes.length} active</span>
                </div>
                <div className="space-y-5">
                  {sendingFaxes.map((fax) => {
                    const totalPages = fax.documents?.reduce((s, d) => s + d.pageCount, 0) || 0;
                    const transferred = fax.recipients?.reduce((s, r) => s + (r.pagesTransferred || 0), 0) || 0;
                    const progress = totalPages > 0 ? Math.round((transferred / totalPages) * 100) : 0;

                    return (
                      <div key={fax.id} className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            → {fax.recipients?.[0]?.name || fax.recipients?.[0]?.faxNumber || "Unknown"}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {fax.subject || "Fax"} • {totalPages} pages
                          </p>
                        </div>
                        <div className="w-[180px]">
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-mono text-slate-400 w-12 text-right">{transferred}/{totalPages}</span>
                        <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleAbort(fax.id)}>
                          Cancel
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Queued for Sending ── */}
          {queuedFaxes.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <p className="font-semibold text-sm mb-4">Queued for Sending</p>
                <div className="space-y-3">
                  {queuedFaxes.map((fax) => (
                    <div key={fax.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <span className="text-lg">⏳</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          → {fax.recipients?.[0]?.name || fax.recipients?.[0]?.faxNumber || "Unknown"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {fax.subject || "Fax"} •{" "}
                          {fax.documents?.reduce((s, d) => s + d.pageCount, 0) || 0} pages •{" "}
                          Queued {new Date(fax.submitTime).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px]">
                        Queued
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/status` shows live updating view of active faxes
- SSE connection indicator works

## Notes
- Abort API route (`/api/fax/[id]/abort`) should be added to task 34 or created separately
- SSE falls back gracefully if connection drops
