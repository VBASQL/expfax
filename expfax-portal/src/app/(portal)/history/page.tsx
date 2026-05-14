"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import Link from "next/link";
import { formatPhone } from "@/lib/phone";

interface FaxRow {
  id: string;
  direction: "received" | "sent";
  subject?: string;
  status: string;
  submitTime: string;
  recipients?: Array<{ name?: string; faxNumber: string }>;
  senderName?: string;
  senderFaxNumber?: string;
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
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  // Load page size from user settings once on mount
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const saved = data?.preferences?.itemsPerPage;
        if (saved === 10 || saved === 20 || saved === 50) setPageSize(saved);
      })
      .catch(() => {});
  }, []);

  const buildFilterParams = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (direction !== "all") p.set("direction", direction);
    if (status !== "all") p.set("status", status);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p;
  }, [search, direction, status, dateFrom, dateTo]);

  const load = useCallback(() => {
    setLoading(true);
    const params = buildFilterParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    fetch(`/api/fax?${params}`)
      .then((r) => r.json())
      .then((data) => { setRows(data.items || []); setTotal(data.total || 0); })
      .finally(() => setLoading(false));
  }, [page, pageSize, buildFilterParams]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  function handleExport() {
    const params = buildFilterParams();
    window.location.href = `/api/fax/export?${params}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <Button variant="outline" size="sm" onClick={handleExport}>
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
              <option value="received">Inbound</option>
              <option value="sent">Outbound</option>
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
            <label className="flex items-center gap-1.5 text-sm text-slate-500">
              From
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-40" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-500">
              To
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-40" />
            </label>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm ml-auto"
              title="Rows per page"
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
            </select>
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
                    const href = row.direction === "received" ? `/inbox/${row.id}?from=history` : `/sent/${row.id}?from=history`;
                    const contact = row.direction === "received"
                      ? (row.senderName || formatPhone(row.senderFaxNumber ?? "") || "Unknown")
                      : (row.recipients?.[0]?.name || formatPhone(row.recipients?.[0]?.faxNumber ?? "") || "Unknown");

                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-4">
                          {row.direction === "received"
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

          {total > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-xs text-slate-400">
                {totalPages > 1 ? `Page ${page} of ${totalPages} (${total} total)` : `${total} record${total !== 1 ? "s" : ""}`}
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
