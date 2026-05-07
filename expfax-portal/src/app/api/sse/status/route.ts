import { NextRequest } from "next/server";
import { validateSession } from "@/lib/auth/session";
import { subscribe } from "@/lib/faxback/sse-broker";

export async function GET(request: NextRequest) {
  const { valid, user } = await validateSession();
  if (!valid || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch { /* controller closed */ }
      };

      // Collect all linked FaxBack account GUIDs (multi-account + legacy primary)
      const accountGuids: string[] = [
        ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
        ...(user.faxbackAccountGuid &&
          !user.faxbackAccounts?.some((a) => a.accountGuid === user.faxbackAccountGuid)
          ? [user.faxbackAccountGuid]
          : []),
      ].filter(Boolean);

      const unsubscribe = subscribe({
        id: Symbol(),
        accountGuids,
        send,
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
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
