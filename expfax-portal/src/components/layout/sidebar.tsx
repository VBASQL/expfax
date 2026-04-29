"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Send, Inbox, SendHorizontal, Activity,
  Users, FileText, Clock, Settings, X, LogOut,
  HardDrive, DollarSign, ScrollText, HeartPulse, UserPlus
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
  { label: "Inbox", href: "/inbox", icon: Inbox },
  { label: "Sent Items", href: "/sent", icon: SendHorizontal },
  { label: "Live Status", href: "/status", icon: Activity },
];

const manageNav = [
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Cover Pages", href: "/covers", icon: FileText },
  { label: "History", href: "/history", icon: Clock },
];

const userBottomNav = [
  { label: "Settings", href: "/settings", icon: Settings },
];

const adminNav = [
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Invitations", href: "/admin/invitations", icon: UserPlus },
  { label: "Storage", href: "/admin/storage", icon: HardDrive },
  { label: "Costs", href: "/admin/costs", icon: DollarSign },
  { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
  { label: "System", href: "/admin/system", icon: HeartPulse },
];

export function Sidebar({ user, isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — still navigate to login
    }
    router.push("/login");
    router.refresh();
  }

  const NavItem = ({ href, icon: Icon, label }: {
    href: string; icon: React.ComponentType<{ className?: string }>;
    label: string;
  }) => {
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
          {isAdmin ? (
            <div>
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Admin</p>
              <div className="space-y-1">
                {adminNav.map((item) => <NavItem key={item.href} {...item} />)}
              </div>
            </div>
          ) : (
            <>
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
                  {userBottomNav.map((item) => <NavItem key={item.href} {...item} />)}
                </div>
              </div>
            </>
          )}
        </nav>

        {/* User */}
        <div className="px-4 py-3 border-t border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 truncate">{user.displayName}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sign out"
            className="text-slate-400 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>
    </>
  );
}
