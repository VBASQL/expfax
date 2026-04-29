# Task 41 — Contacts API Routes

## Goal
Create API routes for contact CRUD, favorites, and CSV export.

## Files to Create
- `src/app/api/contacts/route.ts` — list (GET) + create (POST)
- `src/app/api/contacts/[id]/route.ts` — get (GET), update (PUT), delete (DELETE)
- `src/app/api/contacts/[id]/favorite/route.ts` — toggle favorite (POST)
- `src/app/api/contacts/export/route.ts` — CSV export (GET)
- `src/app/api/contacts/import/route.ts` — CSV import (POST)

## Dependencies
- `src/lib/auth/session.ts` (task 13)
- `src/lib/db/cosmos.ts` (task 11)
- `src/types/index.ts` (task 12)
- `uuid` (installed in task 00)

## Implementation

### 1. `src/app/api/contacts/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import type { Contact } from "@/types";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search") || "";
  const container = await containers.contacts();

  let query = "SELECT * FROM c WHERE c.userId = @uid AND NOT IS_DEFINED(c.type)";
  const params: Array<{ name: string; value: string }> = [{ name: "@uid", value: user.id }];

  if (search) {
    query += " AND (CONTAINS(LOWER(c.name), @search) OR CONTAINS(c.faxNumber, @search) OR CONTAINS(LOWER(c.company), @search))";
    params.push({ name: "@search", value: search.toLowerCase() });
  }

  query += " ORDER BY c.name ASC";

  const { resources } = await container.items.query({ query, parameters: params }).fetchAll();

  return NextResponse.json({ items: resources });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const now = new Date().toISOString();

  const contact: Contact = {
    id: uuid(),
    userId: user.id,
    name: body.name,
    faxNumber: body.faxNumber,
    company: body.company || "",
    email: body.email || "",
    notes: body.notes || "",
    isFavorite: false,
    groups: [],
    createdAt: now,
    updatedAt: now,
  };

  const container = await containers.contacts();
  await container.items.create(contact);

  return NextResponse.json(contact, { status: 201 });
}
```

### 2. `src/app/api/contacts/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.contacts();
  const { resource } = await container.item(params.id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(resource);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const container = await containers.contacts();

  const { resource: existing } = await container.item(params.id, user.id).read();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = {
    ...existing,
    name: body.name ?? existing.name,
    faxNumber: body.faxNumber ?? existing.faxNumber,
    company: body.company ?? existing.company,
    email: body.email ?? existing.email,
    notes: body.notes ?? existing.notes,
    updatedAt: new Date().toISOString(),
  };

  await container.item(params.id, user.id).replace(updated);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.contacts();
  await container.item(params.id, user.id).delete();

  return NextResponse.json({ success: true });
}
```

### 3. `src/app/api/contacts/[id]/favorite/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.contacts();
  const { resource } = await container.item(params.id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await container.item(params.id, user.id).patch([
    { op: "set", path: "/isFavorite", value: !resource.isFavorite },
  ]);

  return NextResponse.json({ success: true, isFavorite: !resource.isFavorite });
}
```

### 4. `src/app/api/contacts/export/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.contacts();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @uid AND NOT IS_DEFINED(c.type) ORDER BY c.name",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  const header = "Name,FaxNumber,Company,Email,Notes";
  const rows = resources.map((c: any) =>
    `"${(c.name || "").replace(/"/g, '""')}","${c.faxNumber || ""}","${(c.company || "").replace(/"/g, '""')}","${c.email || ""}","${(c.notes || "").replace(/"/g, '""')}"`
  );
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="contacts.csv"',
    },
  });
}
```

### 5. `src/app/api/contacts/import/route.ts` — CSV Import

Accepts a CSV string body (Content-Type: text/csv) and bulk-creates contacts. Expected format: `Name,FaxNumber,Company,Email,Notes` (header row optional). Skips rows with no name or fax number.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { v4 as uuid } from "uuid";
import type { Contact } from "@/types";

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const csvText = await request.text();
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    return NextResponse.json({ success: false, error: "Empty CSV" }, { status: 400 });
  }

  // Detect header row
  const firstFields = parseCSVLine(lines[0]);
  const hasHeader = firstFields.some(
    (f) => f.toLowerCase() === "name" || f.toLowerCase() === "faxnumber" || f.toLowerCase() === "fax number"
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const container = await containers.contacts();
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    const name = fields[0] || "";
    const faxNumber = fields[1] || "";
    const company = fields[2] || "";
    const email = fields[3] || "";
    const notes = fields[4] || "";

    if (!name && !faxNumber) { skipped++; continue; }

    const contact: Contact = {
      id: uuid(),
      userId: user.id,
      name: name || faxNumber, // use fax number as name if name is empty
      faxNumber,
      company,
      email,
      notes,
      isFavorite: false,
      groups: [],
      createdAt: now,
      updatedAt: now,
    };

    await container.items.create(contact);
    imported++;
  }

  return NextResponse.json({ success: true, imported, skipped });
}
```

## Files to Create (updated)
Add to the list at the top:
- `src/app/api/contacts/import/route.ts` — CSV import (POST)

## Verify
- `npm run build` — no errors
- All CRUD operations work via the contacts page (task 40)
