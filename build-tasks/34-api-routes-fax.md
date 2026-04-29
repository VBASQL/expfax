# Task 34 — Fax API Routes

## Goal
Create all API routes for fax operations: list, detail, send, download, view URL, mark read, delete.

## Files to Create
- `src/app/api/fax/route.ts` — list faxes (GET with query params)
- `src/app/api/fax/send/route.ts` — send a fax (POST)
- `src/app/api/fax/[id]/route.ts` — get fax detail (GET), delete fax (DELETE)
- `src/app/api/fax/[id]/download/route.ts` — download PDF (GET)
- `src/app/api/fax/[id]/view-url/route.ts` — get SAS URL for PDF viewer (GET)
- `src/app/api/fax/[id]/read/route.ts` — mark as read (POST)

## Dependencies
- `src/lib/auth/session.ts` (task 13)
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/faxback/messages.ts` (task 21)
- `src/lib/services/blob-storage.ts` (task 23)
- `src/types/index.ts` (task 12)

## Implementation

### 1. `src/app/api/fax/route.ts` — List faxes

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const direction = params.get("direction") || "received";
  const page = parseInt(params.get("page") || "1", 10);
  const pageSize = Math.min(parseInt(params.get("pageSize") || "20", 10), 100);
  const search = params.get("search") || "";
  const offset = (page - 1) * pageSize;

  const container = await containers.faxMessages();

  // Build query
  let whereClause = "WHERE c.userId = @uid AND c.direction = @dir AND c.isDeleted = false";
  const queryParams: Array<{ name: string; value: string }> = [
    { name: "@uid", value: user.id },
    { name: "@dir", value: direction },
  ];

  if (search) {
    whereClause += " AND (CONTAINS(c.senderFaxNumber, @search) OR CONTAINS(c.senderName, @search) OR CONTAINS(c.subject, @search))";
    queryParams.push({ name: "@search", value: search });
  }

  // Count
  const { resources: countResult } = await container.items
    .query({ query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`, parameters: queryParams })
    .fetchAll();

  // Items
  const { resources: items } = await container.items
    .query({
      query: `SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime, c.isRead, c.documents FROM c ${whereClause} ORDER BY c.submitTime DESC OFFSET ${offset} LIMIT ${pageSize}`,
      parameters: queryParams,
    })
    .fetchAll();

  return NextResponse.json({
    items,
    total: countResult[0] || 0,
    page,
    pageSize,
    hasMore: offset + pageSize < (countResult[0] || 0),
  });
}
```

### 2. `src/app/api/fax/send/route.ts` — Send fax

Accepts a `recipients[]` array (multi-recipient), `resolution`, and optional `templateFields` for cover page dynamic placeholders.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { sendMessage } from "@/lib/faxback/messages";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    recipients,        // Array<{ faxNumber: string; name: string }>
    subject,
    useCover,
    coverTemplate,
    coverMessage,
    templateFields,    // { senderName, senderCompany, senderFax, senderVoice, receiverName, receiverCompany }
    documents,
    resolution,        // 0=Standard, 2=Fine, 3=Superfine
    scheduleTime,
    billingCode,
  } = body;

  if (!recipients || !Array.isArray(recipients) || recipients.filter((r: any) => r.faxNumber?.trim()).length === 0) {
    return NextResponse.json({ success: false, error: "At least one recipient fax number is required" }, { status: 400 });
  }
  if (!documents || documents.length === 0) {
    return NextResponse.json({ success: false, error: "At least one document is required" }, { status: 400 });
  }

  const validRecipients = recipients.filter((r: any) => r.faxNumber?.trim());

  try {
    const handle = await sendMessage({
      accountGuid: user.faxbackAccountGuid,
      subject,
      senderName: templateFields?.senderName || user.displayName,
      senderCompany: templateFields?.senderCompany || "",
      senderFaxNumber: templateFields?.senderFax || undefined,
      senderVoiceNumber: templateFields?.senderVoice || undefined,
      coverTemplate: useCover ? coverTemplate : undefined,
      coverMessage: useCover ? coverMessage : undefined,
      billingCode,
      resolution: resolution ?? 0,
      scheduleTime,
      recipients: validRecipients.map((r: any) => ({ name: r.name || "", faxNumber: r.faxNumber })),
      documents,
    });

    return NextResponse.json({ success: true, handle });
  } catch (error: any) {
    console.error("Send fax error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to send fax" }, { status: 500 });
  }
}
```

### 3. `src/app/api/fax/[id]/route.ts` — Detail + Delete

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const { resource: fax } = await container.item(params.id, user.id).read();

  if (!fax || fax.isDeleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(fax);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  await container.item(params.id, user.id).patch([
    { op: "set", path: "/isDeleted", value: true },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
```

### 4. `src/app/api/fax/[id]/download/route.ts` — Download PDF

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { downloadFaxPdf } from "@/lib/services/blob-storage";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const { resource: fax } = await container.item(params.id, user.id).read();

  if (!fax || !fax.faxImagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdf = await downloadFaxPdf(fax.faxImagePath);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fax-${params.id}.pdf"`,
    },
  });
}
```

### 5. `src/app/api/fax/[id]/view-url/route.ts` — SAS URL for viewer

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getFaxViewUrl } from "@/lib/services/blob-storage";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const { resource: fax } = await container.item(params.id, user.id).read();

  if (!fax || !fax.faxImagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await getFaxViewUrl(fax.faxImagePath);
  return NextResponse.json({ url });
}
```

### 6. `src/app/api/fax/[id]/read/route.ts` — Mark as read

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  await container.item(params.id, user.id).patch([
    { op: "set", path: "/isRead", value: true },
    { op: "set", path: "/updatedAt", value: new Date().toISOString() },
  ]);

  return NextResponse.json({ success: true });
}
```

## Verify
- `npm run build` — no errors
- All routes are accessible and return proper JSON

## Notes
- All routes check `getCurrentUser()` first — returns 401 if not authenticated
- Fax detail uses point-read by (id, userId) — efficient Cosmos query
- Soft delete: sets `isDeleted = true`, not removed from Cosmos
- List query uses OFFSET/LIMIT for pagination (OK for Cosmos NoSQL)
