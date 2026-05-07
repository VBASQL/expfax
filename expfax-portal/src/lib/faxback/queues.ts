import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";
import type { FaxBackQueueEntry, FaxBackQueueCounts } from "./types";

/**
 * Queue names accepted by the API:
 *   Send/0, Sending/1, Sent/2, Receiving/3, Received/4
 *
 * Portal numeric mapping (used by callers):
 *   1 = Received, 2 = Send, 3 = Sending, 4 = Sent, 5 = SentPendingDeletion
 *   6 = Receiving (inbound in-progress), 7 = ReceivedPendingDeletion
 */
const QUEUE_NAME_MAP: Record<number, string> = {
  1: "Received",
  2: "Send",
  3: "Sending",
  4: "Sent",
  5: "SentPendingDeletion",
  6: "Receiving",
  7: "ReceivedPendingDeletion",
};

/**
 * ReadQueue returns a comma-delimited list of message handles.
 * The API returns JSON: {"MessageHandles":"R-xxx,R-yyy,..."}  (null when empty)
 * Fallbacks: XML envelope or plain comma-separated text.
 */
export async function readQueue(queue: number): Promise<string[]> {
  const queueName = QUEUE_NAME_MAP[queue] || String(queue);
  const res = await faxbackFetch(`Messages/ReadQueue?Queue=${queueName}&AllUsers=1`);
  if (!res.ok) throw new Error(`ReadQueue failed: ${res.status}`);

  const text = await res.text();
  if (!text || !text.trim()) return [];

  // 1. Try JSON — actual server response: {"MessageHandles":"R-xxx,R-yyy,..."}
  try {
    const json = JSON.parse(text);
    const handles: unknown = json?.MessageHandles ?? json?.NSX?.MessageHandles;
    if (typeof handles === "string" && handles.trim()) {
      return handles.split(",").map((h: string) => h.trim()).filter((h: string) => h.length > 0);
    }
    // null means empty queue
    if (handles === null || handles === undefined) return [];
  } catch {
    // not JSON — fall through to XML
  }

  // 2. Try XML — <NSX><MessageHandles>S-xxx,S-yyy</MessageHandles></NSX>
  try {
    const parsed = await parseStringPromise(text, { explicitArray: false });
    const handles = parsed?.NSX?.MessageHandles || parsed?.MessageHandles || "";
    if (typeof handles === "string" && handles.trim()) {
      return handles.split(",").map((h: string) => h.trim()).filter((h: string) => h.length > 0);
    }
    const messages = parsed?.NSX?.Message || parsed?.Messages?.Message || parsed?.Message;
    if (messages) {
      const arr = Array.isArray(messages) ? messages : [messages];
      return arr.map((m: Record<string, string>) => m.Handle || m.MessageHandle).filter(Boolean);
    }
    return [];
  } catch {
    // 3. Plain comma-separated text
    return text.split(",").map((h) => h.trim()).filter((h) => h.length > 0);
  }
}

export async function getQueueCounts(): Promise<FaxBackQueueCounts> {
  const res = await faxbackFetch("Messages/GetQueueCounts?AllUsers=1");
  if (!res.ok) throw new Error(`GetQueueCounts failed: ${res.status}`);

  const text = await res.text();
  let counts: Record<string, unknown> = {};

  try {
    const json = JSON.parse(text);
    counts = (json?.NSX?.QueueCounts ?? json?.QueueCounts ?? json) as Record<string, unknown>;
  } catch {
    try {
      const parsed = await parseStringPromise(text, { explicitArray: false });
      counts = parsed?.NSX?.QueueCounts || parsed?.QueueCounts || {};
    } catch { /* leave counts empty */ }
  }

  return {
    Received: parseInt((counts.Received as string) || "0", 10),
    Send: parseInt((counts.Send as string) || "0", 10),
    Sending: parseInt((counts.Sending as string) || "0", 10),
    Sent: parseInt((counts.Sent as string) || "0", 10),
    SentPendingDeletion: parseInt((counts.SentPendingDeletion as string) || "0", 10),
    Receiving: parseInt((counts.Receiving as string) || "0", 10),
    ReceivedPendingDeletion: parseInt((counts.ReceivedPendingDeletion as string) || "0", 10),
    Failed: parseInt((counts.Failed as string) || "0", 10),
  };
}
