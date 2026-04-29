# Task 16 — App Shell: Sidebar + Header + Layout

## Goal
Build the authenticated layout with sidebar navigation, header, and responsive shell. This is the `(portal)/layout.tsx` that wraps all authenticated pages.

## Files to Create
- `src/components/layout/sidebar.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/app-shell.tsx`
- `src/app/(portal)/layout.tsx`

## Design Reference
Use the UI from the demo `index.html` as visual reference. The sidebar has:
- Brand: "EF" icon + "ExpFax" text
- Nav sections: MAIN (Dashboard, Send Fax, Inbox, Sent Items, Live Status) and MANAGE (Contacts, Cover Pages, History) and bottom (Settings, Admin)
- User avatar + name + role at bottom
- Responsive: collapses to hamburger on mobile

## Implementation

### 1. Create `src/components/layout/sidebar.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Send, Inbox, SendHorizontal, Activity,
  Users, FileText, Clock, Settings, ShieldCheck, X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  user: { displayName: string; role: string; email: string };
  isOpen: boolean;
  onClose: () => void;
}

const mainNav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Send Fax", href: "/send", icon: Send },
  { label: "Inbox", href: "/inbox", icon: Inbox, badge: true },
  { label: "Sent Items", href: "/sent", icon: SendHorizontal },
  { label: "Live Status", href: "/status", icon: Activity },
];

const manageNav = [
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Cover Pages", href: "/covers", icon: FileText },
  { label: "History", href: "/history", icon: Clock },
];

const bottomNav = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Admin", href: "/admin/users", icon: ShieldCheck, adminOnly: true },
];

export function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = user.role === "admin";
  const initials = user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const NavItem = ({ href, icon: Icon, label, adminOnly }: {
    href: string; icon: React.ComponentType<{ className?: string }>;
    label: string; adminOnly?: boolean;
  }) => {
    if (adminOnly && !isAdmin) return null;
    return (
      <Link
        href={href}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          isActive(href)
            ? "bg-blue-50 text-blue-600"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen w-[260px] bg-white border-r border-slate-200 z-50 flex flex-col transition-transform duration-300",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold text-sm">
            EF
          </div>
          <span className="text-lg font-bold text-slate-800">ExpFax</span>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-6">
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Main</p>
            <div className="space-y-1">
              {mainNav.map((item) => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
          <div>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Manage</p>
            <div className="space-y-1">
              {manageNav.map((item) => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
          <div>
            <div className="space-y-1">
              {bottomNav.map((item) => <NavItem key={item.href} {...item} />)}
            </div>
          </div>
        </nav>

        {/* User */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{user.displayName}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
```

### 2. Create `src/components/layout/header.tsx`

```tsx
"use client";

import { Menu, Search, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  onSearchClick: () => void; // opens global search (⌘K) — wired by app-shell
}

export function Header({ title, onMenuClick, onSearchClick }: HeaderProps) {
  return (
    <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-30 flex items-center justify-between px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Global search trigger — opens command dialog (task 57) */}
        <button
          type="button"
          onClick={onSearchClick}
          className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-400 min-w-[200px] hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <Search className="h-4 w-4" />
          <span>Search faxes...</span>
          <kbd className="ml-auto text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
        </button>

        {/* Help button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" asChild>
              <a href="https://docs.expfax.com" target="_blank" rel="noopener noreferrer">
                <HelpCircle className="h-4 w-4 text-slate-400" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Help &amp; Documentation</TooltipContent>
        </Tooltip>

        {/* Notifications — live bell component (task 56) */}
        <NotificationBell />
      </div>
    </header>
  );
}
```

### 3. Create `src/components/layout/app-shell.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AppShellProps {
  user: { displayName: string; role: string; email: string };
  title: string;
  children: React.ReactNode;
}

export function AppShell({ user, title, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K keyboard shortcut to open global search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-50">
        <Sidebar user={user} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="lg:ml-[260px]">
          <Header
            title={title}
            onMenuClick={() => setSidebarOpen(true)}
            onSearchClick={() => setSearchOpen(true)}
          />
          <main className="p-6 lg:p-8">{children}</main>
        </div>

        {/* Global search command dialog — task 57 will create GlobalSearch and add:
            import { GlobalSearch } from "@/components/layout/global-search";
            <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
            For now, render nothing — task 57 patches this file. */}
      </div>
    </TooltipProvider>
  );
}
```

### 4. Create `src/app/(portal)/layout.tsx`

This is the server component that validates the session and wraps children in the shell.

```tsx
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { valid, user } = await validateSession();

  if (!valid || !user) {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        displayName: user.displayName,
        role: user.role,
        email: user.email,
      }}
      title="ExpFax Portal"
    >
      {children}
    </AppShell>
  );
}
```

## Verify
- `npm run build` — no errors
- The layout renders sidebar + header + content area
- Sidebar highlights active route
- Responsive: sidebar collapses on mobile

## Notes
- Each page inside `(portal)/` will be wrapped by this layout automatically
- The `title` prop on AppShell can be overridden per-page using a title context (optional enhancement)
