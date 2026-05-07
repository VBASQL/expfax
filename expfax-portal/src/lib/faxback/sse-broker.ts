/**
 * Shared SSE broker — one server-side poller, N subscribers.
 *
 * Instead of 200 users each running setInterval → 200×3 FaxBack calls/tick,
 * this module runs a single interval that makes 3 queue reads + 1 message-block
 * read every POLL_INTERVAL_MS, then fans the results out to every connected client.
 *
 * Memory cost: ~200 lightweight writer refs in a Map + Set. Negligible.
 */

import { readQueue } from "@/lib/faxback/queues";
import { readMessageBlock } from "@/lib/faxback/messages";

const POLL_INTERVAL_MS = 5_000;

// Portal queue numbers
const QUEUE_SEND = 2;
const QUEUE_SENDING = 3;
const QUEUE_RECEIVING = 6;

interface LiveFaxRecipient {
  address: string;
  name: string;
  state: number;
  pageCount: number;
  pagesTransferred: number;
  connectBps: number;
  portUsed: string;
  retries: number;
}

export interface LiveFax {
  messageHandle: string;
  subject: string;
  direction: "outbound" | "inbound";
  status: "queued" | "sending" | "receiving";
  routingTarget: string;
  submitTime: string;
  recipients: LiveFaxRecipient[];
}

function normalizeRecipients(raw: unknown): LiveFaxRecipient[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter(Boolean).map((r: Record<string, unknown>) => ({
    address: String(r.Address || r.Name || ""),
    name: String(r.Name || ""),
    state: Number(r.State) || 0,
    pageCount: Number(r.PageCount) || 0,
    pagesTransferred: Number(r.PagesTransferred) || 0,
    connectBps: Number(r.ConnectBPS) || 0,
    portUsed: String(r.PortUsed || ""),
    retries: Number(r.Retries) || 0,
  }));
}

function faxbackQueueToStatus(q: number): "queued" | "sending" | "receiving" {
  if (q === 0) return "queued";
  if (q === 1) return "sending";
  if (q === 3) return "receiving";
  return "queued";
}

/** A subscriber is identified by a unique ID and filtered by one or more accountGuids. */
export interface Subscriber {
  id: symbol;
  accountGuids: string[];
  send: (data: string) => void;
}

// --- Singleton state ---------------------------------------------------------

/** All connected SSE clients. Keyed by subscriber id for fast removal. */
const subscribers = new Map<symbol, Subscriber>();

let pollerHandle: ReturnType<typeof setInterval> | null = null;

/** Cache last payload per accountGuid so a new subscriber gets data immediately. */
const lastPayload = new Map<string, string>();
const EMPTY_PAYLOAD = JSON.stringify({ type: "status_update", activeFaxes: [] });

// --- Polling loop ------------------------------------------------------------

async function runPoll() {
  if (subscribers.size === 0) return; // nothing to do

  try {
    const [sendHandles, sendingHandles, receivingHandles] = await Promise.all([
      readQueue(QUEUE_SEND).catch(() => [] as string[]),
      readQueue(QUEUE_SENDING).catch(() => [] as string[]),
      readQueue(QUEUE_RECEIVING).catch(() => [] as string[]),
    ]);

    const allHandles = [...sendHandles, ...sendingHandles, ...receivingHandles];

    // Map: accountGuid → LiveFax[]
    const byAccount = new Map<string, LiveFax[]>();

    if (allHandles.length > 0) {
      const details = await readMessageBlock(allHandles);

      for (const msg of details) {
        const m = msg as Record<string, unknown>;
        const accountGuid = String(m.AccountGuid || "");
        if (!accountGuid) continue;

        const handle = String(m.MessageHandle || m.Handle || "");
        const fax: LiveFax = {
          messageHandle: handle,
          subject: String(m.Subject || ""),
          direction: handle.startsWith("R-") ? "inbound" : "outbound",
          status: faxbackQueueToStatus(Number(m.Queue) || 0),
          routingTarget: String(m.RoutingTarget || ""),
          submitTime: String(m.SubmitTime || ""),
          recipients: normalizeRecipients(m.Recipient),
        };

        const list = byAccount.get(accountGuid) ?? [];
        list.push(fax);
        byAccount.set(accountGuid, list);
      }
    }

    // Broadcast to all subscribers, filtered by their linked account guids
    for (const sub of subscribers.values()) {
      if (sub.accountGuids.length === 0) {
        sub.send(EMPTY_PAYLOAD);
        continue;
      }
      const activeFaxes = sub.accountGuids.flatMap((guid) => byAccount.get(guid) ?? []);
      const payload = JSON.stringify({ type: "status_update", activeFaxes });
      lastPayload.set(sub.accountGuids[0], payload);
      sub.send(payload);
    }
  } catch (err) {
    console.error("[sse-broker] poll error:", err);
  }
}

// --- Public API --------------------------------------------------------------

/** Register a subscriber. Returns an unsubscribe function. */
export function subscribe(sub: Subscriber): () => void {
  subscribers.set(sub.id, sub);

  // Send last known payload immediately so the client isn't blank on connect
  if (sub.accountGuids.length > 0) {
    const cached = lastPayload.get(sub.accountGuids[0]);
    sub.send(cached ?? EMPTY_PAYLOAD);
  } else {
    sub.send(EMPTY_PAYLOAD);
  }

  // Start the shared poller if this is the first subscriber
  if (!pollerHandle) {
    pollerHandle = setInterval(runPoll, POLL_INTERVAL_MS);
    if (pollerHandle && typeof pollerHandle === "object" && "unref" in pollerHandle) {
      (pollerHandle as NodeJS.Timeout).unref();
    }
  }

  return function unsubscribe() {
    subscribers.delete(sub.id);
    if (subscribers.size === 0 && pollerHandle) {
      clearInterval(pollerHandle);
      pollerHandle = null;
    }
  };
}
