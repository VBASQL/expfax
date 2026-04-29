# Task 30 — Dashboard Page

## Goal
Build the main dashboard with stats cards, recent activity, quick actions, and live sending progress.

## Files to Create
- `src/app/(portal)/page.tsx`
- `src/app/api/fax/dashboard/route.ts`

## Dependencies
- `src/components/layout/app-shell.tsx` (task 16) — layout already wraps this page
- `src/lib/db/cosmos.ts` (task 11)
- `src/lib/faxback/queues.ts` (task 21) — `getQueueCounts()`
- `src/lib/auth/session.ts` (task 13) — `getCurrentUser()`

## Dashboard Elements (from design doc section 7.1)
- Unread received faxes count
- Faxes currently sending (with progress)
- Recent activity feed (last 10 sent/received)
- Quick-send shortcut
- Queue count summary

## Implementation

### 1. Create `src/app/api/fax/dashboard/route.ts`

API route that returns all dashboard data in one call.

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { containers } from "@/lib/db/cosmos";
import { getQueueCounts } from "@/lib/faxback/queues";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const faxContainer = await containers.faxMessages();

  // Unread received count
  const { resources: unreadResult } = await faxContainer.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.direction = 'received' AND c.isRead = false AND c.isDeleted = false",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Currently sending count
  const { resources: sendingResult } = await faxContainer.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.status IN ('queued', 'sending')",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Recent activity (last 10)
  const { resources: recentActivity } = await faxContainer.items
    .query({
      query: "SELECT c.id, c.direction, c.status, c.subject, c.senderName, c.senderFaxNumber, c.recipients, c.submitTime, c.isRead FROM c WHERE c.userId = @uid AND c.isDeleted = false ORDER BY c.submitTime DESC OFFSET 0 LIMIT 10",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  // Total sent today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { resources: sentTodayResult } = await faxContainer.items
    .query({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.direction = 'sent' AND c.submitTime >= @today",
      parameters: [
        { name: "@uid", value: user.id },
        { name: "@today", value: today.toISOString() },
      ],
    })
    .fetchAll();

  // FaxBack queue counts (from live server)
  let queueCounts = null;
  try {
    queueCounts = await getQueueCounts();
  } catch (err) {
    console.error("Failed to get queue counts:", err);
  }

  return NextResponse.json({
    unreadCount: unreadResult[0] || 0,
    sendingCount: sendingResult[0] || 0,
    sentToday: sentTodayResult[0] || 0,
    recentActivity,
    queueCounts,
  });
}
```

### 2. Create `src/app/(portal)/page.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Inbox, Send, Activity, Clock,
  ArrowUpRight, ArrowDownLeft, AlertCircle, Loader2
} from "lucide-react";

interface DashboardData {
  unreadCount: number;
  sendingCount: number;
  sentToday: number;
  recentActivity: Array<{
    id: string;
    direction: string;
    status: string;
    subject: string;
    senderName: string;
    senderFaxNumber: string;
    recipients: Array<{ name: string; faxNumber: string }>;
    submitTime: string;
    isRead: boolean;
  }>;
  queueCounts: {
    Received: number;
    Send: number;
    Sending: number;
    Sent: number;
    Failed: number;
  } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/fax/dashboard")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetch("/api/fax/dashboard").then((r) => r.json()).then(setData);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) return null;

  const stats = [
    { label: "Unread Faxes", value: data.unreadCount, icon: Inbox, color: "blue" },
    { label: "Sending Now", value: data.sendingCount, icon: Activity, color: "yellow" },
    { label: "Sent Today", value: data.sentToday, icon: Send, color: "green" },
    { label: "Queue Total", value: data.queueCounts ? data.queueCounts.Received + data.queueCounts.Send + data.queueCounts.Sending : 0, icon: Clock, color: "purple" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    yellow: "bg-amber-50 text-amber-600",
    green: "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-500">{stat.label}</span>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[stat.color]}`}>
                  <stat.icon className="h-[18px] w-[18px]" />
                </div>
              </div>
              <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-[15px] font-semibold">Recent Activity</CardTitle>
            <Link href="/history" className="text-xs text-blue-600 font-medium hover:underline">View all</Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentActivity.length === 0 ? (
              <p className="text-sm text-slate-400 p-6 text-center">No recent activity</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recentActivity.map((item) => (
                  <Link
                    key={item.id}
                    href={item.direction === "received" ? `/inbox/${item.id}` : `/sent/${item.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      item.direction === "received" ? "bg-emerald-50 text-emerald-600" :
                      item.status === "failed" ? "bg-red-50 text-red-600" :
                      "bg-blue-50 text-blue-600"
                    }`}>
                      {item.direction === "received" ? <ArrowDownLeft className="h-4 w-4" /> :
                       item.status === "failed" ? <AlertCircle className="h-4 w-4" /> :
                       <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.direction === "received"
                          ? item.senderFaxNumber || item.senderName || "Unknown"
                          : item.recipients?.[0]?.faxNumber || "Unknown"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.subject || (item.direction === "received" ? "Received fax" : "Sent fax")}
                      </p>
                    </div>
                    <Badge variant={
                      item.status === "sent" || item.status === "received" ? "default" :
                      item.status === "failed" ? "destructive" : "secondary"
                    } className="text-[10px]">
                      {item.status}
                    </Badge>
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {new Date(item.submitTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Send a Fax", desc: "Compose and send", href: "/send", icon: Send, color: "blue" },
              { label: "View Inbox", desc: `${data.unreadCount} unread`, href: "/inbox", icon: Inbox, color: "green" },
              { label: "Live Status", desc: "Active transmissions", href: "/status", icon: Activity, color: "purple" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-white transition-all group"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorMap[action.color]}`}>
                  <action.icon className="h-[18px] w-[18px]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{action.label}</p>
                  <p className="text-xs text-slate-400">{action.desc}</p>
                </div>
                <span className="text-slate-300 group-hover:text-blue-500 transition-colors">→</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- Dashboard loads at `/` with stats, activity list, and quick actions
- Auto-refreshes every 30 seconds

## Notes
- The stats query uses cross-partition queries (userId is the partition key) — this is fine for single-user dashboard queries
- Queue counts come from FaxBack live server, may fail if FaxBack is down — handled gracefully
