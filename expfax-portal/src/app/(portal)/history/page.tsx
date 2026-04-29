"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import Link from "next/link";

interface FaxRow {
  id: string;
  direction: "inbound" | "outbound";
  subject?: string;
  status: string;
  submitTime: string;
  recipients?: Array<{ name?: string; faxNumber: string }>;
  callerName?: string;
  callerNumber?: string;
}

function StatusBadge({ status }: { status: string }) {
  const lc = status.toLowerCase();
  let cls = "bg-slate-100 text-slate-600";
  if (lc === "sent" || lc === "delivered") cls = "bg-emerald-50 text-emerald-700";
  else if (lc === "failed" || lc === "error") cls = "bg-red-50 text-red-700";
  else if (lc === "queued" || lc === "sending") cls = "bg-amber-50 text-amber-700";
  return <Badge className={`text-[10px] ${cls}`}>{status}</Badge>;
}

export default function HistoryPage() {
  const [rows, setRows] = useState<FaxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ includeAll: "true", page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (direction !== "all") params.set("direction", direction);
    if (status !== "all") params.set("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    fetch(`/api/fax?${params}`)
      .then((r) => r.json())
      .then((data) => { setRows(data.items || []); setTotal(data.total || 0); })
      .finally(() => setLoading(false));
  }, [page, search, direction, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <Button variant="outline" size="sm" onClick={() => window.open("/api/fax/export", "_blank")}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              placeholder="Search subject, fax number..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-60"
            />
            <select
              value={direction}
              onChange={(e) => { setDirection(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
              <option value="failed">Failed</option>
            </select>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" />
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No fax history found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-slate-500 text-xs">
                    <th className="text-left py-2 pr-4">Dir</th>
                    <th className="text-left py-2 pr-4">From / To</th>
                    <th className="text-left py-2 pr-4">Subject</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const href = row.direction === "inbound" ? `/inbox/${row.id}` : `/sent/${row.id}`;
                    const contact = row.direction === "inbound"
                      ? (row.callerName || row.callerNumber || "Unknown")
                      : (row.recipients?.[0]?.name || row.recipients?.[0]?.faxNumber || "Unknown");

                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-4">
                          {row.direction === "inbound"
                            ? <ArrowDown className="h-4 w-4 text-blue-400" />
                            : <ArrowUp className="h-4 w-4 text-emerald-500" />}
                        </td>
                        <td className="py-2 pr-4">
                          <Link href={href} className="text-blue-600 hover:underline">{contact}</Link>
                        </td>
                        <td className="py-2 pr-4 text-slate-600 truncate max-w-[200px]">{row.subject || "—"}</td>
                        <td className="py-2 pr-4"><StatusBadge status={row.status} /></td>
                        <td className="py-2 text-slate-400 text-xs whitespace-nowrap">
                          {new Date(row.submitTime).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages} ({total} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
