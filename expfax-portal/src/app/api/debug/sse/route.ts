import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readQueue } from "@/lib/faxback/queues";
import { readMessageBlock } from "@/lib/faxback/messages";

/**
 * Debug endpoint — mirrors what the SSE broker does so we can see what's
 * actually coming back from FaxBack vs. what's stored on the user.
 *
 * Returns:
 *   - userAccountGuids: the GUIDs the SSE subscriber would filter by
 *   - queue handles per Send/Sending/Receiving
 *   - per-message: handle, AccountGuid, Queue, RoutingTarget, Subject
 *   - matchedFaxes: how many faxes would be visible to this user
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userAccountGuids: string[] = [
    ...(user.faxbackAccounts?.map((a) => a.accountGuid) ?? []),
    ...(user.faxbackAccountGuid &&
      !user.faxbackAccounts?.some((a) => a.accountGuid === user.faxbackAccountGuid)
      ? [user.faxbackAccountGuid]
      : []),
  ].filter(Boolean);

  const [send, sending, receiving] = await Promise.all([
    readQueue(2).catch((e) => ({ error: String(e) })),
    readQueue(3).catch((e) => ({ error: String(e) })),
    readQueue(6).catch((e) => ({ error: String(e) })),
  ]);

  const allHandles: string[] = [
    ...(Array.isArray(send) ? send : []),
    ...(Array.isArray(sending) ? sending : []),
    ...(Array.isArray(receiving) ? receiving : []),
  ];

  let messages: Array<Record<string, unknown>> = [];
  let messagesError: string | null = null;
  let rawMessages: unknown = null;
  if (allHandles.length > 0) {
    try {
      const details = await readMessageBlock(allHandles);
      rawMessages = details; // full unfiltered objects so we can see every field FaxBack returns
      messages = details.map((m) => {
        const r = m as Record<string, unknown>;
        return {
          handle: r.MessageHandle ?? r.Handle,
          accountGuid: r.AccountGuid,
          queue: r.Queue,
          routingTarget: r.RoutingTarget,
          subject: r.Subject,
          submitTime: r.SubmitTime,
          allKeys: Object.keys(r),
          matchesUser: typeof r.AccountGuid === "string" && userAccountGuids.includes(r.AccountGuid),
        };
      });
    } catch (e) {
      messagesError = String(e);
    }
  }

  return NextResponse.json({
    userId: user.id,
    userEmail: user.email,
    userAccountGuids,
    legacyFaxbackAccountGuid: user.faxbackAccountGuid ?? null,
    multiAccounts: user.faxbackAccounts ?? [],
    queues: { send, sending, receiving },
    handleCounts: {
      send: Array.isArray(send) ? send.length : "error",
      sending: Array.isArray(sending) ? sending.length : "error",
      receiving: Array.isArray(receiving) ? receiving.length : "error",
    },
    messages,
    rawMessages,
    messagesError,
    matchedCount: messages.filter((m) => m.matchesUser).length,
  });
}
