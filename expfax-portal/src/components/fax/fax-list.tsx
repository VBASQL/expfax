"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export interface FaxListItem {
  id: string;
  direction: string;
  status: string;
  subject: string;
  senderName: string;
  senderFaxNumber: string;
  recipients: Array<{ name: string; faxNumber: string; totalSeconds?: number }>;
  submitTime: string;
  isRead: boolean;
  documents: Array<{ pageCount: number }>;
}

interface FaxListProps {
  direction: "received" | "sent";
  basePath: string; // "/inbox" or "/sent"
}

export function FaxList({ direction, basePath }: FaxListProps) {
  const [items, setItems] = useState<FaxListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      direction,
      page: String(page),
      pageSize: String(pageSize),
      ...(search ? { search } : {}),
    });
    fetch(`/api/fax?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [direction, page, search]);

  const totalPages = Math.ceil(total / pageSize);

  const statusColors: Record<string, string> = {
    received: "bg-blue-50 text-blue-600",
    sent: "bg-emerald-50 text-emerald-600",
    sending: "bg-amber-50 text-amber-600",
    queued: "bg-slate-100 text-slate-600",
    failed: "bg-red-50 text-red-600",
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={direction === "received" ? "Search by sender..." : "Search by recipient..."}
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <span className="text-sm text-slate-400">{total} total</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {direction === "received" ? "From" : "To"}
              </th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Subject</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pages</th>
              {direction === "sent" && (
                <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duration</th>
              )}
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</th>
              <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={direction === "sent" ? 6 : 5} className="px-5 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={direction === "sent" ? 6 : 5} className="px-5 py-8 text-center text-sm text-slate-400">No faxes found</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className={`hover:bg-slate-50 cursor-pointer transition-colors ${!item.isRead && direction === "received" ? "font-semibold" : ""}`}>
                <td className="px-5 py-3">
                  <Link href={`${basePath}/${item.id}`} className="block">
                    <div className="flex items-center gap-2">
                      {!item.isRead && direction === "received" && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                      )}
                      <span className="text-sm">
                        {direction === "received"
                          ? item.senderFaxNumber || item.senderName || "Unknown"
                          : item.recipients?.[0]?.faxNumber || "Unknown"}
                      </span>
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-3 text-sm text-slate-500 truncate max-w-[200px]">
                  {item.subject || "—"}
                </td>
                <td className="px-5 py-3 text-sm text-slate-500">
                  {item.documents?.reduce((sum, d) => sum + d.pageCount, 0) || "—"}
                </td>
                {direction === "sent" && (
                  <td className="px-5 py-3 text-sm text-slate-400 font-mono">
                    {(() => {
                      const secs = item.recipients?.reduce((s, r) => s + (r.totalSeconds || 0), 0) || 0;
                      if (!secs) return "—";
                      const m = Math.floor(secs / 60);
                      const s = secs % 60;
                      return `${m}:${String(s).padStart(2, "0")}`;
                    })()}
                  </td>
                )}
                <td className="px-5 py-3">
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[item.status] || ""}`}>
                    {item.status}
                  </Badge>
                </td>
                <td className="px-5 py-3 text-sm text-slate-400 whitespace-nowrap">
                  {new Date(item.submitTime).toLocaleDateString()} {new Date(item.submitTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
