# Task 33 — Sent Items Page + Detail View

## Goal
Build the sent items list and detail view showing per-recipient transmission details.

## Files to Create
- `src/app/(portal)/sent/page.tsx`
- `src/app/(portal)/sent/[id]/page.tsx`

## Dependencies
- `src/components/fax/fax-list.tsx` (task 32) — reuse the FaxList component
- API routes from task 34

## Design (from design doc section 7.4)
- List: recipient number/name, date/time, page count, status, duration
- Status indicators: Queued, Sending, Delivered, Failed
- Detail: transmission info per recipient (connect time, BPS, retries, error details)
- Resend failed faxes

## Implementation

### 1. Create `src/app/(portal)/sent/page.tsx`

```tsx
import { FaxList } from "@/components/fax/fax-list";

export default function SentPage() {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Sent Items</h2>
      <FaxList direction="sent" basePath="/sent" />
    </div>
  );
}
```

### 2. Create `src/app/(portal)/sent/[id]/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, RefreshCcw, Phone, Clock, Zap, RotateCcw } from "lucide-react";

interface RecipientDetail {
  recipientGuid: string;
  name: string;
  faxNumber: string;
  status: string;
  error: string;
  errorNumber: number;
  dialSeconds: number;
  connectSeconds: number;
  totalSeconds: number;
  pageCount: number;
  pagesTransferred: number;
  connectBps: number;
  retries: number;
  localCsid: string;
  remoteCsid: string;
}

interface SentFaxDetail {
  id: string;
  subject: string;
  status: string;
  submitTime: string;
  scheduleTime: string | null;
  coverTemplate: string;
  billingCode: string;
  resolution: number;
  recipients: RecipientDetail[];
  documents: Array<{ name: string; pageCount: number }>;
  faxImagePath: string;
}

export default function SentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [fax, setFax] = useState<SentFaxDetail | null>(null);

  useEffect(() => {
    fetch(`/api/fax/${id}`).then((r) => r.json()).then(setFax);
  }, [id]);

  if (!fax) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  const statusColor: Record<string, string> = {
    sent: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    sending: "bg-amber-50 text-amber-700",
    queued: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sent")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Sent
        </Button>
        {fax.status === "failed" && (
          <Button variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-1" /> Resend
          </Button>
        )}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Transmission Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-slate-400">Status:</span> <Badge className={`ml-2 text-[10px] ${statusColor[fax.status] || ""}`}>{fax.status}</Badge></div>
          <div><span className="text-slate-400">Submitted:</span> <span className="ml-2">{new Date(fax.submitTime).toLocaleString()}</span></div>
          <div><span className="text-slate-400">Subject:</span> <span className="ml-2">{fax.subject || "—"}</span></div>
          <div><span className="text-slate-400">Billing Code:</span> <span className="ml-2">{fax.billingCode || "—"}</span></div>
        </CardContent>
      </Card>

      {/* Per-Recipient Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Recipients ({fax.recipients.length})</h3>
        {fax.recipients.map((r, i) => (
          <Card key={r.recipientGuid || i}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold">{r.name || r.faxNumber}</p>
                  <p className="text-sm text-slate-400 font-mono">{r.faxNumber}</p>
                </div>
                <Badge className={`text-[10px] ${r.status?.toLowerCase().includes("success") || r.pagesTransferred > 0 ? statusColor.sent : r.error ? statusColor.failed : statusColor.queued}`}>
                  {r.error ? "Failed" : r.pagesTransferred > 0 ? "Delivered" : "Pending"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span>Dial: {r.dialSeconds}s</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Total: {r.totalSeconds}s</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Zap className="h-3.5 w-3.5" />
                  <span>{r.connectBps} bps</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retries: {r.retries}</span>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-500">
                Pages: {r.pagesTransferred} / {r.pageCount} transferred
                {r.remoteCsid && <span className="ml-4">CSID: {r.remoteCsid}</span>}
              </div>

              {r.error && (
                <div className="mt-3 bg-red-50 text-red-700 text-sm rounded-lg p-3">
                  Error {r.errorNumber}: {r.error}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Download */}
      {fax.faxImagePath && (
        <Button asChild>
          <a href={`/api/fax/${id}/download`} download>
            <Download className="h-4 w-4 mr-2" /> Download Fax PDF
          </a>
        </Button>
      )}
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/sent` shows sent fax list
- `/sent/[id]` shows per-recipient transmission details

## Notes
- Resend button is UI only for now — the actual resend logic reuses the send API from task 34
- The FaxList component is shared with inbox (task 32)
