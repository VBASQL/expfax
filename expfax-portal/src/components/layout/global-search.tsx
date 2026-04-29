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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
