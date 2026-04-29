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

      await poll();

      const interval = setInterval(poll, 5000);

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
