"use client";

import { useState, useEffect } from "react";
import { Clock, Mail } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { GlobalSearch } from "./global-search";
import { TooltipProvider } from "@/components/ui/tooltip";

interface AppShellProps {
  user: { displayName: string; isAdmin: boolean; email: string };
  title: string;
  isPending?: boolean;
  children: React.ReactNode;
}

export function AppShell({ user, title, isPending, children }: AppShellProps) {
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
          {isPending && (
            <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
              <Clock className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Account setup in progress.</strong> An administrator needs to link your fax
                line before you can send or receive faxes.
              </span>
              <a
                href="mailto:support@expfax.com?subject=Account%20linking%20request"
                className="ml-auto flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors shrink-0"
              >
                <Mail className="h-3 w-3" /> Contact support
              </a>
            </div>
          )}
          <main className="p-6 lg:p-8">{children}</main>
        </div>

        {/* GlobalSearch command palette */}
        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </TooltipProvider>
  );
}
