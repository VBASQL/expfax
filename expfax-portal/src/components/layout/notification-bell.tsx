"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Inbox, CheckCircle, XCircle, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  async function handleDismissAll() {
    await fetch("/api/notifications/read", { method: "POST" });
    setNotifications([]);
    setUnreadCount(0);
  }

  async function handleDismissOne(id: string, type: Notification["type"], e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Optimistic remove
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (type === "received") {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/dismiss`, { method: "POST" });
    } catch {
      // re-fetch on failure to restore truth
      fetchNotifications();
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          {notifications.length > 0 && (
            <button onClick={handleDismissAll} className="text-xs text-blue-600 hover:underline">
              Dismiss all
            </button>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto overscroll-contain">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No new notifications</div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="group relative flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-1 min-w-0 items-start gap-3 pr-6"
                  >
                    <div className="mt-0.5 shrink-0">{icons[n.type]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 break-words">{n.message}</p>
                      {n.detail && <p className="text-xs text-slate-400 break-words line-clamp-2">{n.detail}</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.time)}</p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={(e) => handleDismissOne(n.id, n.type, e)}
                    className="absolute top-2 right-2 inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
