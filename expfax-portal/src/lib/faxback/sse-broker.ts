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

// How many consecutive polls a handle can be "missing" from FaxBack queues
// before we drop it from the UI. Smooths over the brief gap when FaxBack moves
// a handle Send→Sending→Sent (it's momentarily in neither queue) and over
// transient ReadQueue errors.
const STALE_TOLERANCE_POLLS = 2;

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
  connectSeconds: number;
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
    connectSeconds: Number(r.ConnectSeconds) || 0,
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

/**
 * Sticky cache of the most recent LiveFax we've seen for each handle, plus
 * how many consecutive polls it has been missing from the FaxBack queues.
 *
 * Why: FaxBack's ReadQueue is eventually-consistent and a handle is briefly
 * absent from BOTH Send and Sending while it's being moved between them.
 * Per-recipient PageCount/PagesTransferred are also populated lazily and can
 * momentarily come back lower than a previous sample. Without this cache the
 * UI would clear mid-transmission and page counters would visibly jitter.
 */
interface CachedFax {
  fax: LiveFax;
  accountGuid: string;
  missedPolls: number;
}
const handleCache = new Map<string, CachedFax>();

/** Merge a fresh LiveFax with the previously cached one, clamping monotonic
 *  counters so values can never go backwards within a single transmission. */
function mergeWithCached(fresh: LiveFax, prev: LiveFax | undefined): LiveFax {
  if (!prev) return fresh;

  // Build a lookup of previous recipients by address so per-recipient
  // counters can be clamped individually (handles multi-recipient faxes).
  const prevByAddr = new Map(prev.recipients.map((r) => [r.address, r]));
  const mergedRecipients = fresh.recipients.map((r) => {
    const p = prevByAddr.get(r.address);
    if (!p) return r;
    return {
      ...r,
      pageCount: Math.max(r.pageCount, p.pageCount),
      pagesTransferred: Math.max(r.pagesTransferred, p.pagesTransferred),
      connectSeconds: Math.max(r.connectSeconds, p.connectSeconds),
      retries: Math.max(r.retries, p.retries),
    };
  });

  // If FaxBack returned fewer recipients than we previously saw (transient
  // partial response), keep the previously-known ones so the totals don't drop.
  const freshAddrs = new Set(fresh.recipients.map((r) => r.address));
  for (const p of prev.recipients) {
    if (!freshAddrs.has(p.address)) mergedRecipients.push(p);
  }

  return { ...fresh, recipients: mergedRecipients };
}

// --- Polling loop ------------------------------------------------------------

async function runPoll() {
  if (subscribers.size === 0) return; // nothing to do

  try {
    // Run the three queue reads, but track failures explicitly. If ANY of them
    // fails we treat the whole poll as inconclusive and skip the broadcast,
    // so a transient FaxBack/session blip doesn't clear the UI.
    const results = await Promise.all([
      readQueue(QUEUE_SEND).then((h) => ({ ok: true as const, h }), () => ({ ok: false as const, h: [] as string[] })),
      readQueue(QUEUE_SENDING).then((h) => ({ ok: true as const, h }), () => ({ ok: false as const, h: [] as string[] })),
      readQueue(QUEUE_RECEIVING).then((h) => ({ ok: true as const, h }), () => ({ ok: false as const, h: [] as string[] })),
    ]);
    if (results.some((r) => !r.ok)) {
      console.warn("[sse-broker] one or more ReadQueue calls failed — skipping broadcast to preserve last state");
      return;
    }
    const [sendHandles, sendingHandles, receivingHandles] = results.map((r) => r.h);

    const allHandles = [...sendHandles, ...sendingHandles, ...receivingHandles];
    const seenThisPoll = new Set(allHandles);

    // Fetch details and update the sticky cache
    if (allHandles.length > 0) {
      let details: unknown[];
      try {
        details = await readMessageBlock(allHandles);
      } catch (err) {
        console.warn("[sse-broker] ReadMessageBlock failed — skipping broadcast:", err);
        return;
      }

      for (const msg of details) {
        const m = msg as Record<string, unknown>;
        const accountGuid = String(m.AccountGuid || "");
        if (!accountGuid) continue;

        const handle = String(m.MessageHandle || m.Handle || "");
        const fresh: LiveFax = {
          messageHandle: handle,
          subject: String(m.Subject || ""),
          direction: handle.startsWith("R-") ? "inbound" : "outbound",
          status: faxbackQueueToStatus(Number(m.Queue) || 0),
          routingTarget: String(m.RoutingTarget || ""),
          submitTime: String(m.SubmitTime || ""),
          recipients: normalizeRecipients(m.Recipient),
        };
        const prev = handleCache.get(handle);
        handleCache.set(handle, {
          fax: mergeWithCached(fresh, prev?.fax),
          accountGuid,
          missedPolls: 0,
        });
      }
    }

    // Age out anything not seen this poll. Drop only after STALE_TOLERANCE_POLLS
    // consecutive misses to ride out brief queue-transition gaps.
    for (const [handle, cached] of handleCache) {
      if (!seenThisPoll.has(handle)) {
        cached.missedPolls += 1;
        if (cached.missedPolls > STALE_TOLERANCE_POLLS) {
          handleCache.delete(handle);
        }
      }
    }

    // Group the cached faxes by accountGuid for broadcast
    const byAccount = new Map<string, LiveFax[]>();
    for (const cached of handleCache.values()) {
      const list = byAccount.get(cached.accountGuid) ?? [];
      list.push(cached.fax);
      byAccount.set(cached.accountGuid, list);
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
