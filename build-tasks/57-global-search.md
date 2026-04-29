# Task 57 — Global Search (⌘K Command Palette)

## Goal
Build a global fax search command dialog that opens with ⌘K / Ctrl+K. Searches fax messages (inbox, sent, history) by recipient/sender number, name, subject, and status. Shows results in a command-palette-style dialog with instant navigation.

## Files to Create
- `src/components/layout/global-search.tsx`
- `src/app/api/search/route.ts`

## Files to Modify
- `src/components/layout/app-shell.tsx` (task 16) — add `<GlobalSearch>` component

## Dependencies
- `src/lib/auth/session.ts` (task 13)
- `src/lib/db/cosmos.ts` (task 11)
- shadcn: `Command` dialog (already installed via `npx shadcn add command` in task 00)

## Design
- ⌘K / Ctrl+K shortcut opens a command-palette dialog (like VS Code / Raycast)
- Type to search across all faxes — matches sender/recipient number, name, subject
- Results grouped by direction: Received, Sent
- Each result shows: direction icon, sender/recipient, subject, date, status badge
- Click a result → navigate to fax detail page
- Dismiss with Escape or clicking outside

## Implementation

### 1. Create `src/app/api/search/route.ts`

Full-text search across fax messages for the current user.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const container = await containers.faxMessages();
  const searchLower = q.toLowerCase();

  const { resources } = await container.items
    .query({
      query: `SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime
              FROM c
              WHERE c.userId = @uid AND c.isDeleted = false
              AND (
                CONTAINS(LOWER(c.senderName), @q)
                OR CONTAINS(c.senderFaxNumber, @q)
                OR CONTAINS(LOWER(c.subject), @q)
                OR ARRAY_LENGTH(ARRAY(SELECT VALUE r FROM r IN c.recipients WHERE CONTAINS(LOWER(r.name), @q) OR CONTAINS(r.faxNumber, @q))) > 0
              )
              ORDER BY c.submitTime DESC
              OFFSET 0 LIMIT 20`,
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@q", value: searchLower },
      ],
    })
    .fetchAll();

  return NextResponse.json({ results: resources });
}
```

### 2. Create `src/components/layout/global-search.tsx`

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Inbox, SendHorizontal } from "lucide-react";

interface SearchResult {
  id: string;
  direction: string;
  status: string;
  subject: string;
  senderName: string;
  senderFaxNumber: string;
  recipients: Array<{ name: string; faxNumber: string }>;
  submitTime: string;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  function handleSelect(result: SearchResult) {
    const path = result.direction === "received" ? `/inbox/${result.id}` : `/sent/${result.id}`;
    router.push(path);
    onOpenChange(false);
  }

  const received = results.filter((r) => r.direction === "received");
  const sent = results.filter((r) => r.direction === "sent");

  const statusColor: Record<string, string> = {
    sent: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    received: "bg-blue-50 text-blue-700",
    sending: "bg-amber-50 text-amber-700",
    queued: "bg-slate-100 text-slate-700",
  };

  function ResultItem({ r }: { r: SearchResult }) {
    const label = r.direction === "received"
      ? r.senderName || r.senderFaxNumber
      : r.recipients?.[0]?.name || r.recipients?.[0]?.faxNumber || "Unknown";
    const number = r.direction === "received"
      ? r.senderFaxNumber
      : r.recipients?.[0]?.faxNumber || "";

    return (
      <CommandItem onSelect={() => handleSelect(r)} className="flex items-center gap-3 py-2">
        {r.direction === "received" ? (
          <Inbox className="h-4 w-4 text-blue-500 shrink-0" />
        ) : (
          <SendHorizontal className="h-4 w-4 text-emerald-500 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{label}</span>
            {number && <span className="text-xs text-slate-400 font-mono">{number}</span>}
          </div>
          {r.subject && <p className="text-xs text-slate-400 truncate">{r.subject}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className={`text-[10px] ${statusColor[r.status] || ""}`}>
            {r.status}
          </Badge>
          <span className="text-[10px] text-slate-400">
            {new Date(r.submitTime).toLocaleDateString()}
          </span>
        </div>
      </CommandItem>
    );
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search faxes by number, name, or subject..." value={query} onValueChange={setQuery} />
      <CommandList>
        {loading && <div className="py-4 text-center text-xs text-slate-400">Searching...</div>}
        <CommandEmpty>{query.length >= 2 ? "No faxes found." : "Type at least 2 characters to search..."}</CommandEmpty>

        {received.length > 0 && (
          <CommandGroup heading="Received">
            {received.map((r) => <ResultItem key={r.id} r={r} />)}
          </CommandGroup>
        )}
        {sent.length > 0 && (
          <CommandGroup heading="Sent">
            {sent.map((r) => <ResultItem key={r.id} r={r} />)}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

### 3. Modify `src/components/layout/app-shell.tsx` (from task 16)

Add the GlobalSearch component to the app shell. The `searchOpen` state and ⌘K handler are already in place from task 16.

**Add import:**
```tsx
import { GlobalSearch } from "./global-search";
```

**Add inside the return, after `</main>` and before the comment placeholder:**
```tsx
<GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
```

Remove the task-57 placeholder comment.

## Verify
- `npm run build` — no errors
- Press ⌘K (or Ctrl+K on Windows) — search dialog opens
- Type a phone number or name — results appear grouped by Received/Sent
- Click a result — navigates to fax detail
- Press Escape — dialog closes

## Notes
- The Cosmos DB query uses `CONTAINS` on lowered strings — for large datasets, consider adding a composite index on userId + direction + submitTime
- Search is limited to 20 results per query
- The Command component from shadcn provides built-in keyboard navigation (arrow keys, Enter)
