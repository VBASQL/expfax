# Task 32 — Inbox Page + Detail View

## Goal
Build the inbox (received faxes list) and the detail view for a single received fax.

## Files to Create
- `src/app/(portal)/inbox/page.tsx`
- `src/app/(portal)/inbox/[id]/page.tsx`
- `src/components/fax/fax-list.tsx`

## Dependencies
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)
- API routes from task 34 (`/api/fax/[id]`, `/api/fax/[id]/download`)

## Design (from design doc section 7.3)
- List: sender number, date/time, page count, status, unread indicator
- Click to view fax as PDF in browser
- Download as PDF
- Mark as read/unread
- Search/filter by date range, sender number
- Pagination

## Implementation

### 1. Create `src/components/fax/fax-list.tsx`

Reusable fax table component used by both inbox and sent pages.

```tsx
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
```

### 2. Create `src/app/(portal)/inbox/page.tsx`

```tsx
import { FaxList } from "@/components/fax/fax-list";

export default function InboxPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Inbox</h2>
      <FaxList direction="received" basePath="/inbox" />
    </div>
  );
}
```

### 3. Create `src/app/(portal)/inbox/[id]/page.tsx`

Detail view with PDF viewer, download button, and metadata.

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, FileText } from "lucide-react";

interface FaxDetail {
  id: string;
  senderName: string;
  senderFaxNumber: string;
  senderCompany: string;
  subject: string;
  status: string;
  submitTime: string;
  documents: Array<{ name: string; pageCount: number }>;
  recipients: Array<{ name: string; faxNumber: string }>;
  faxImagePath: string;
}

export default function InboxDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [fax, setFax] = useState<FaxDetail | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fax/${id}`).then((r) => r.json()).then((data) => {
      setFax(data);
      // Mark as read
      fetch(`/api/fax/${id}/read`, { method: "POST" });
    });
    fetch(`/api/fax/${id}/view-url`).then((r) => r.json()).then((data) => {
      if (data.url) setPdfUrl(data.url);
    });
  }, [id]);

  if (!fax) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PDF Viewer */}
        <div className="lg:col-span-2">
          <Card className="h-[700px]">
            <CardContent className="p-0 h-full">
              {pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-full rounded-xl" title="Fax viewer" />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <FileText className="h-12 w-12" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Metadata */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fax Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-slate-400">From:</span> <span className="font-medium ml-2">{fax.senderFaxNumber || fax.senderName}</span></div>
              <div><span className="text-slate-400">Company:</span> <span className="ml-2">{fax.senderCompany || "—"}</span></div>
              <div><span className="text-slate-400">Subject:</span> <span className="ml-2">{fax.subject || "—"}</span></div>
              <div><span className="text-slate-400">Status:</span> <Badge variant="secondary" className="ml-2 text-[10px]">{fax.status}</Badge></div>
              <div><span className="text-slate-400">Received:</span> <span className="ml-2">{new Date(fax.submitTime).toLocaleString()}</span></div>
              <div><span className="text-slate-400">Pages:</span> <span className="ml-2">{fax.documents?.reduce((s, d) => s + d.pageCount, 0) || "—"}</span></div>
            </CardContent>
          </Card>

          <Button className="w-full" asChild>
            <a href={`/api/fax/${id}/download`} download>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/inbox` shows fax list table with pagination
- `/inbox/[id]` shows PDF viewer + metadata sidebar

## Notes
- API routes (`/api/fax`, `/api/fax/[id]`, `/api/fax/[id]/download`, `/api/fax/[id]/view-url`, `/api/fax/[id]/read`) are built in task 34
- The `FaxList` component is reused by the sent items page (task 33)
