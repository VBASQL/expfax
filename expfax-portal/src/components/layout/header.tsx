"use client";

import { Menu, Search, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  onSearchClick: () => void;
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
        {/* Global search trigger */}
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
          <TooltipTrigger>
            <a
              href="https://docs.expfax.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100 transition-colors"
            >
              <HelpCircle className="h-4 w-4 text-slate-400" />
            </a>
          </TooltipTrigger>
          <TooltipContent>Help &amp; Documentation</TooltipContent>
        </Tooltip>

        {/* Notifications */}
        <NotificationBell />
      </div>
    </header>
  );
}
