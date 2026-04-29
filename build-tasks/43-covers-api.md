# Task 43 — Cover Template API Routes

## Goal
Create API routes for cover template management: list, upload (to FaxBack + Cosmos), download, delete, set default.

## Files to Create
- `src/app/api/templates/route.ts` — list (GET) + upload (POST)
- `src/app/api/templates/[id]/route.ts` — delete (DELETE)
- `src/app/api/templates/[id]/download/route.ts` — download (GET)
- `src/app/api/templates/[id]/default/route.ts` — set default (POST)

## Dependencies
- `src/lib/faxback/templates.ts` (task 21) — `addTemplate`, `getTemplateContent`, `deleteTemplate`
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/auth/session.ts` (task 13)

## Implementation

### 1. `src/app/api/templates/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { addTemplate } from "@/lib/faxback/templates";
import { v4 as uuid } from "uuid";
import type { CoverTemplate } from "@/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.coverTemplates();
  const { resources } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.userId = @uid OR c.userId = null ORDER BY c.templateName",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  return NextResponse.json({ items: resources });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, contentBase64 } = await request.json();
  if (!name || !contentBase64) {
    return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
  }

  // Upload to FaxBack (overwrite if exists)
  await addTemplate(name, contentBase64, false);

  const now = new Date().toISOString();
  const template: CoverTemplate = {
    id: uuid(),
    userId: user.id,
    templateName: name,
    templateGuid: name, // FaxBack uses name as identifier
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  };

  const container = await containers.coverTemplates();
  await container.items.create(template);

  return NextResponse.json(template, { status: 201 });
}
```

### 2. `src/app/api/templates/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { deleteTemplate as fbDeleteTemplate } from "@/lib/faxback/templates";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.coverTemplates();
  const { resource } = await container.item(params.id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete from FaxBack
  try {
    await fbDeleteTemplate(resource.templateName);
  } catch (err) {
    console.error("FaxBack delete template error:", err);
  }

  // Delete from Cosmos
  await container.item(params.id, user.id).delete();

  return NextResponse.json({ success: true });
}
```

### 3. `src/app/api/templates/[id]/download/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getTemplateContent } from "@/lib/faxback/templates";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.coverTemplates();
  const { resource } = await container.item(params.id, user.id).read();
  if (!resource) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base64Content = await getTemplateContent(resource.templateName);
  const buffer = Buffer.from(base64Content, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/rtf",
      "Content-Disposition": `attachment; filename="${resource.templateName}.rtf"`,
    },
  });
}
```

### 4. `src/app/api/templates/[id]/default/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.coverTemplates();

  // Unset all defaults for this user
  const { resources } = await container.items
    .query({
      query: "SELECT c.id FROM c WHERE c.userId = @uid AND c.isDefault = true",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  for (const t of resources) {
    await container.item(t.id, user.id).patch([{ op: "set", path: "/isDefault", value: false }]);
  }

  // Set new default
  await container.item(params.id, user.id).patch([{ op: "set", path: "/isDefault", value: true }]);

  return NextResponse.json({ success: true });
}
```

## Verify
- `npm run build` — no errors
- Templates can be uploaded, listed, downloaded, deleted, set as default
