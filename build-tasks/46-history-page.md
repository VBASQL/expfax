# Task 46 — History / Archive Page

## Goal
Build the full searchable history page with date range filters, status filters, direction filter, and CSV export.

## Files to Create
- `src/app/(portal)/history/page.tsx`
- `src/app/api/fax/export/route.ts`

## Dependencies
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)
- shadcn Calendar/Popover for date picker

## Design (from design doc section 7.8)
- Full searchable history of all sent and received faxes
- Filter by: date range, direction, status, search text
- Export to CSV
- Pagination

## Implementation

### 1. Create `src/app/(portal)/history/page.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Download, ChevronLeft, ChevronRight, Filter } from "lucide-react";

interface HistoryItem {
  id: string;
  direction: string;
  status: string;
  subject: string;
  senderName: string;
  senderFaxNumber: string;
  recipients: Array<{ name: string; faxNumber: string }>;
  submitTime: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(search ? { search } : {}),
      ...(direction !== "all" ? { direction } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      includeAll: "true",
    });
    fetch(`/api/fax?${params}`)
      .then((r) => r.json())
      .then((data) => { setItems(data.items || []); setTotal(data.total || 0); })
      .finally(() => setLoading(false));
  }, [search, direction, status, dateFrom, dateTo, page]);

  const totalPages = Math.ceil(total / pageSize);

  async function handleExport() {
    const params = new URLSearchParams({
      ...(search ? { search } : {}),
      ...(direction !== "all" ? { direction } : {}),
      ...(status !== "all" ? { status } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
    const res = await fetch(`/api/fax/export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "fax-history.csv"; a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fax History</h2>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Search..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }}>
              <option value="all">All Directions</option>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
            </select>
            <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="all">All Statuses</option>
              <option value="sent">Delivered</option>
              <option value="received">Received</option>
              <option value="failed">Failed</option>
            </select>
            <Input type="date" className="w-auto" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="From" />
            <Input type="date" className="w-auto" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="To" />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Direction</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">From / To</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Subject</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">No records found</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50 cursor-pointer">
                <td className="px-5 py-3">
                  <Badge variant="outline" className="text-[10px]">{item.direction}</Badge>
                </td>
                <td className="px-5 py-3 text-sm font-medium">
                  <Link href={`/${item.direction === "received" ? "inbox" : "sent"}/${item.id}`}>
                    {item.direction === "received" ? item.senderFaxNumber || item.senderName : item.recipients?.[0]?.faxNumber || "—"}
                  </Link>
                </td>
                <td className="px-5 py-3 text-sm text-slate-500 truncate max-w-[200px]">{item.subject || "—"}</td>
                <td className="px-5 py-3"><Badge variant="secondary" className="text-[10px]">{item.status}</Badge></td>
                <td className="px-5 py-3 text-sm text-slate-400">{new Date(item.submitTime).toLocaleString()}</td>
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
          <span className="text-sm text-slate-400">Page {page} of {totalPages} ({total} records)</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

### 2. Create `src/app/api/fax/export/route.ts`

CSV export of fax history.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @uid AND c.isDeleted = false ORDER BY c.submitTime DESC",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  const header = "Direction,Status,From/To,Subject,Date,Pages";
  const rows = resources.map((f: any) => {
    const contact = f.direction === "received" ? f.senderFaxNumber : f.recipients?.[0]?.faxNumber || "";
    const pages = f.documents?.reduce((s: number, d: any) => s + (d.pageCount || 0), 0) || 0;
    return `"${f.direction}","${f.status}","${contact}","${(f.subject || "").replace(/"/g, '""')}","${f.submitTime}","${pages}"`;
  });

  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="fax-history.csv"' },
  });
}
```

## Verify
- `npm run build` — no errors
- `/history` shows filtered, paginated history with export
