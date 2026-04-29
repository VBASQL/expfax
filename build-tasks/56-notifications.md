# Task 56 — Notification Bell + Dropdown

## Goal
Make the header notification bell functional: show a red badge with unread count, open a dropdown listing recent events (new fax received, send completed, send failed), mark all as read, link to the relevant fax.

## Files to Create
- `src/components/layout/notification-bell.tsx`
- `src/app/api/notifications/route.ts`
- `src/app/api/notifications/read/route.ts`

## Dependencies
- `src/lib/auth/session.ts` (task 13)
- `src/lib/db/cosmos.ts` (task 11)
- `src/types/index.ts` (task 12)
- Header component (task 16)
- shadcn: `Popover`, `ScrollArea`, `Badge` (already installed)

## Design
The notification bell in the header (task 16) currently renders a static icon. This task makes it live:
- Badge shows unread count (red dot if > 0, number if > 9)
- Click opens a popover dropdown with recent notifications
- Each notification shows: icon (📥 received, ✅ delivered, ❌ failed), message, time ago, link
- "Mark all as read" button clears the badge
- Notifications are stored in the `faxMessages` container — derived from status changes (no separate collection needed)

## Implementation

### 1. Create `src/app/api/notifications/route.ts`

Returns the most recent unread events for the current user. Derives notifications from fax messages:
- Received faxes that are unread (`direction = "received" AND isRead = false`)
- Sent faxes that recently completed/failed (`direction = "sent" AND status IN ("sent", "failed") AND notifiedAt IS NULL`)

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();

  // Unread received faxes
  const { resources: received } = await container.items
    .query({
      query: `SELECT c.id, c.senderFaxNumber, c.senderName, c.submitTime, c.documents
              FROM c WHERE c.userId = @uid AND c.direction = 'received' AND c.isRead = false AND c.isDeleted = false
              ORDER BY c.submitTime DESC OFFSET 0 LIMIT 10`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Recently completed/failed sent faxes (not yet notified)
  const { resources: sentUpdates } = await container.items
    .query({
      query: `SELECT c.id, c.subject, c.status, c.recipients, c.submitTime
              FROM c WHERE c.userId = @uid AND c.direction = 'sent'
              AND c.status IN ('sent', 'failed')
              AND (NOT IS_DEFINED(c.notifiedAt) OR c.notifiedAt = null)
              AND c.isDeleted = false
              ORDER BY c.submitTime DESC OFFSET 0 LIMIT 10`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Count total unread
  const { resources: countResult } = await container.items
    .query({
      query: `SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.direction = 'received' AND c.isRead = false AND c.isDeleted = false`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  const notifications = [
    ...received.map((f: any) => ({
      id: f.id,
      type: "received" as const,
      message: `New fax from ${f.senderName || f.senderFaxNumber}`,
      detail: `${f.documents?.reduce((s: number, d: any) => s + (d.pageCount || 0), 0) || 0} pages`,
      time: f.submitTime,
      href: `/inbox/${f.id}`,
    })),
    ...sentUpdates.map((f: any) => ({
      id: f.id,
      type: f.status === "sent" ? ("delivered" as const) : ("failed" as const),
      message: f.status === "sent"
        ? `Fax delivered to ${f.recipients?.[0]?.name || f.recipients?.[0]?.faxNumber || "recipient"}`
        : `Fax failed — ${f.recipients?.[0]?.name || f.recipients?.[0]?.faxNumber || "recipient"}`,
      detail: f.subject || "",
      time: f.submitTime,
      href: `/sent/${f.id}`,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 15);

  return NextResponse.json({
    notifications,
    unreadCount: (countResult[0] || 0) + sentUpdates.length,
  });
}
```

### 2. Create `src/app/api/notifications/read/route.ts`

Marks sent-fax notifications as acknowledged (sets `notifiedAt`). Received fax read status is handled by the existing mark-as-read route.

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const container = await containers.faxMessages();
  const now = new Date().toISOString();

  // Mark all un-notified sent completions as notified
  const { resources: pending } = await container.items
    .query({
      query: `SELECT c.id FROM c WHERE c.userId = @uid AND c.direction = 'sent'
              AND c.status IN ('sent', 'failed')
              AND (NOT IS_DEFINED(c.notifiedAt) OR c.notifiedAt = null)
              AND c.isDeleted = false`,
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  for (const item of pending) {
    await container.item(item.id, user.id).patch([
      { op: "set", path: "/notifiedAt", value: now },
    ]);
  }

  return NextResponse.json({ success: true, marked: pending.length });
}
```

### 3. Create `src/components/layout/notification-bell.tsx`

Client component that polls notifications and renders a popover dropdown.

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Inbox, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";

interface Notification {
  id: string;
  type: "received" | "delivered" | "failed";
  message: string;
  detail: string;
  time: string;
  href: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const icons = {
  received: <Inbox className="h-4 w-4 text-blue-500" />,
  delivered: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch { /* silent */ }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  async function handleMarkAllRead() {
    await fetch("/api/notifications/read", { method: "POST" });
    setUnreadCount(0);
    fetchNotifications();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="max-h-[320px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No new notifications</div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="mt-0.5 shrink-0">{icons[n.type]}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{n.message}</p>
                    {n.detail && <p className="text-xs text-slate-400 truncate">{n.detail}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.time)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
```

### 4. Update header (task 16) to use NotificationBell

In `src/components/layout/header.tsx`, replace the static Bell button with the live component:

**Add import at top:**
```tsx
import { NotificationBell } from "./notification-bell";
```

**Replace the static bell button:**
```tsx
// BEFORE (static):
<Button variant="outline" size="icon" className="relative">
  <Bell className="h-4 w-4" />
  <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
</Button>

// AFTER (live):
<NotificationBell />
```

Also remove the `Bell` import from lucide-react in header.tsx since it's now in notification-bell.tsx.

## Verify
- `npm run build` — no errors
- Bell icon shows unread count badge
- Clicking bell opens popover with recent events
- "Mark all read" clears badge
- Clicking a notification navigates to the fax detail

## Notes
- Polling interval is 30s — adjust as needed for production
- `notifiedAt` field is added to fax messages to track which sent-completion events the user has seen
- No separate notifications collection needed — derived from existing `faxMessages` container
