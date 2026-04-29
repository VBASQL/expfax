import { parseStringPromise } from "xml2js";
import { faxbackFetch } from "./session";
import type { FaxBackQueueEntry, FaxBackQueueCounts } from "./types";

/**
 * Queue IDs: 1=Received, 2=Send, 3=Sending, 4=Sent
 */
export async function readQueue(queue: number): Promise<FaxBackQueueEntry[]> {
  const res = await faxbackFetch(`Messages/ReadQueue?Queue=${queue}&AllUsers=1`);
  if (!res.ok) throw new Error(`ReadQueue failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const messages = parsed?.Messages?.Message;
  if (!messages) return [];
  return Array.isArray(messages) ? messages : [messages];
}

export async function getQueueCounts(): Promise<FaxBackQueueCounts> {
  const res = await faxbackFetch("Messages/GetQueueCounts");
  if (!res.ok) throw new Error(`GetQueueCounts failed: ${res.status}`);

  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const counts = parsed?.QueueCounts || {};

  return {
    Received: parseInt(counts.Received || "0", 10),
    Send: parseInt(counts.Send || "0", 10),
    Sending: parseInt(counts.Sending || "0", 10),
    Sent: parseInt(counts.Sent || "0", 10),
    Failed: parseInt(counts.Failed || "0", 10),
  };
}
