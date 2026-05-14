"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { useContactNames } from "@/lib/contacts/use-contact-names";

interface LiveRecipient {
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

interface LiveFax {
  messageHandle: string;
  subject: string;
  direction: "outbound" | "inbound";
  status: "queued" | "sending" | "receiving";
  routingTarget: string;
  submitTime: string;
  recipients: LiveRecipient[];
}

export default function LiveStatusPage() {
  const [activeFaxes, setActiveFaxes] = useState<LiveFax[]>([]);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  function connect() {
    if (esRef.current) {
      esRef.current.close();
    }
    const es = new EventSource("/api/sse/status");
    esRef.current = es;
    setConnected(false);
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === "status_update") {
        setActiveFaxes(data.activeFaxes);
      }
    };
    es.onerror = () => setConnected(false);
  }

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    connect();
    setTimeout(() => setRefreshing(false), 800);
  }

  async function handleAbort(messageHandle: string) {
    if (!confirm("Abort this fax?")) return;
    await fetch("/api/fax/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageHandle }),
    });
  }

  const sendingFaxes = activeFaxes.filter((f) => f.status === "sending");
  const receivingFaxes = activeFaxes.filter((f) => f.status === "receiving");
  const queuedFaxes = activeFaxes.filter((f) => f.status === "queued");

  // Batch-resolve contact names for every address currently in the live feed
  const allAddresses = useMemo(
    () =>
      activeFaxes.flatMap((f) =>
        (f.recipients ?? []).map((r) => r.address).filter(Boolean)
      ),
    [activeFaxes]
  );
  const contactNames = useContactNames(allAddresses);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live Status</h2>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
          <span className="text-xs text-slate-400">{connected ? "Connected" : "Disconnected"}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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
          {sendingFaxes.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-sm">⚡ Outbound — Transmitting</p>
                  <span className="text-xs text-emerald-600">● {sendingFaxes.length} active</span>
                </div>
                <div className="space-y-5">
                  {sendingFaxes.map((fax) => {
                    const recipients = fax.recipients ?? [];
                    const multi = recipients.length > 1;
                    // Per-recipient page totals — FaxBack reports pageCount/pagesTransferred
                    // per <Recipient>, so we sum BOTH (not numerator only) to avoid "10 of 5".
                    const totalPages = recipients.reduce((s, r) => s + (r.pageCount || 0), 0);
                    const transferred = recipients.reduce((s, r) => s + (r.pagesTransferred || 0), 0);
                    const progress = totalPages > 0 ? Math.round((transferred / totalPages) * 100) : 0;
                    const bps = recipients[0]?.connectBps;
                    const firstAddr = recipients[0]?.address || "";
                    const firstContactName = firstAddr ? contactNames[normalizePhone(firstAddr)]?.name : undefined;
                    const firstLabel = firstContactName || recipients[0]?.name || (firstAddr ? formatPhone(firstAddr) : "Unknown");
                    const firstDisplay = firstContactName && firstAddr
                      ? `${firstContactName} · ${formatPhone(firstAddr)}`
                      : firstLabel;

                    return (
                      <div key={fax.messageHandle} className="space-y-2">
                        <div className="flex items-center gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              → {multi ? `${firstDisplay} +${recipients.length - 1} more` : firstDisplay}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {fax.subject || "Fax"} • {totalPages || "?"} pages{multi ? ` across ${recipients.length} recipients` : ""}
                              {bps ? ` • ${(bps / 1000).toFixed(1)}k bps` : ""}
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
                          <span className="text-xs font-mono text-slate-400 w-14 text-right">{transferred}/{totalPages || "?"}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => handleAbort(fax.messageHandle)}
                          >
                            Cancel
                          </Button>
                        </div>

                        {/* Per-recipient breakdown (only when there are 2+ recipients) */}
                        {multi && (
                          <div className="ml-1 pl-3 border-l-2 border-slate-100 space-y-1">
                            {recipients.map((r, idx) => {
                              const rTotal = r.pageCount || 0;
                              const rTx = r.pagesTransferred || 0;
                              const rPct = rTotal > 0 ? Math.round((rTx / rTotal) * 100) : 0;
                              return (
                                <div key={idx} className="flex items-center gap-3 text-[11px]">
                                  <span className="min-w-0 flex-1 truncate text-slate-500">
                                    {(() => {
                                      const cn = contactNames[normalizePhone(r.address)]?.name;
                                      const label = cn || r.name || "";
                                      return label
                                        ? <>{label} <span className="font-mono">· {r.address}</span></>
                                        : <span className="font-mono">{r.address}</span>;
                                    })()}
                                  </span>
                                  <div className="w-[120px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-300" style={{ width: `${rPct}%` }} />
                                  </div>
                                  <span className="font-mono text-slate-400 w-10 text-right">{rTx}/{rTotal || "?"}</span>
                                  {r.retries > 0 && <span className="text-amber-600">↻{r.retries}</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {receivingFaxes.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-semibold text-sm">📥 Inbound — Receiving</p>
                  <span className="text-xs text-indigo-600">● {receivingFaxes.length} active</span>
                </div>
                <div className="space-y-4">
                  {receivingFaxes.map((fax) => {
                    const totalPages = fax.recipients?.[0]?.pageCount || 0;
                    const received = fax.recipients?.[0]?.pagesTransferred || 0;
                    const progress = totalPages > 0 ? Math.round((received / totalPages) * 100) : 0;

                    const firstRec = fax.recipients?.[0];
                    const connSecs = firstRec?.connectSeconds || 0;
                    const bpsIn = firstRec?.connectBps;
                    const inboundAddr = firstRec?.address || "";
                    const inboundContactName = inboundAddr ? contactNames[normalizePhone(inboundAddr)]?.name : undefined;
                    const inboundLabel = inboundContactName
                      ? `${inboundContactName} · ${formatPhone(inboundAddr)}`
                      : (formatPhone(inboundAddr) || inboundAddr || "Unknown");
                    const durStr = (() => {
                      if (!connSecs) return null;
                      const m = Math.floor(connSecs / 60);
                      const s = connSecs % 60;
                      return `${m}:${String(s).padStart(2, "0")}`;
                    })();

                    return (
                      <div key={fax.messageHandle} className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            ← {inboundLabel}
                          </p>
                          <p className="text-xs text-slate-400">
                            {totalPages > 0 ? `${received} / ${totalPages} pages` : "Receiving…"}
                            {durStr ? ` • ${durStr}` : ""}
                            {bpsIn ? ` • ${(bpsIn / 1000).toFixed(1)}k bps` : ""}
                          </p>
                        </div>
                        {totalPages > 0 ? (
                          <>
                            <div className="w-[180px]">
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs font-mono text-slate-400 w-12 text-right">{received}/{totalPages}</span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 w-[216px]" />
                        )}
                        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 text-[10px]">
                          Receiving
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {queuedFaxes.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <p className="font-semibold text-sm mb-4">⏳ Queued for Sending</p>
                <div className="space-y-3">
                  {queuedFaxes.map((fax) => (
                    <div key={fax.messageHandle} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <span className="text-lg">⏳</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          → {(() => {
                            const addr = fax.recipients?.[0]?.address || "";
                            const cn = addr ? contactNames[normalizePhone(addr)]?.name : undefined;
                            if (cn && addr) return `${cn} · ${formatPhone(addr)}`;
                            return fax.recipients?.[0]?.name || (addr ? formatPhone(addr) : "Unknown");
                          })()}
                        </p>
                        <p className="text-xs text-slate-400">
                          {fax.subject || "Fax"} • Queued {new Date(fax.submitTime).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px]">
                        Queued
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => handleAbort(fax.messageHandle)}
                      >
                        Cancel
                      </Button>
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
