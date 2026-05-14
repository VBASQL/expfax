"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Tag, X, RefreshCw } from "lucide-react";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { useContactNames } from "@/lib/contacts/use-contact-names";

// ─── Types ───────────────────────────────────────────────────────────────────

// Minimal shape of an active fax from the SSE broker
interface SseLiveFax {
  messageHandle: string;
  direction: "inbound" | "outbound";
  status: "queued" | "sending" | "receiving";
  routingTarget: string;
  submitTime: string;
  recipients: Array<{ address: string; name: string; pageCount: number; pagesTransferred: number }>;
}

export interface FaxListItem {
  id: string;
  direction: string;
  status: string;
  subject: string;
  senderName: string;
  senderFaxNumber: string;
  recipients: Array<{ name: string; faxNumber: string; totalSeconds?: number; pageCount?: number; callerID?: string; remoteCsid?: string }>;
  submitTime: string;
  isRead: boolean;
  documents: Array<{ pageCount: number }>;
  sentFromAccountGuid?: string | null;
  sentFromAccountId?: string | null;
  receivedToAccountGuid?: string | null;
  receivedToAccountId?: string | null;
  receivedToFaxNumber?: string | null;
  tags?: string[] | null;
}

interface LinkedAccount {
  accountGuid: string;
  accountId: string;
  faxNumber?: string | null;
  label?: string | null;
}

interface FaxListProps {
  direction: "received" | "sent";
  basePath: string;
  accounts?: LinkedAccount[];
}

type SortField = "submitTime" | "senderFaxNumber" | "receivedToFaxNumber";
type SortDir = "asc" | "desc";

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ field, sortBy, sortDir }: { field: SortField; sortBy: SortField; sortDir: SortDir }) {
  if (sortBy !== field) return <ChevronsUpDown className="inline h-3 w-3 ml-1 text-slate-300" />;
  return sortDir === "asc"
    ? <ChevronUp className="inline h-3 w-3 ml-1 text-slate-600" />
    : <ChevronDown className="inline h-3 w-3 ml-1 text-slate-600" />;
}

// ─── Tag cell (double-click to edit inline) ───────────────────────────────────

function TagCell({
  faxId,
  initialTags,
  allTags,
  onSaved,
}: {
  faxId: string;
  initialTags: string[];
  allTags: string[];
  onSaved: (tags: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync if parent re-fetches
  useEffect(() => { setTags(initialTags); }, [initialTags]);

  // Close on outside click
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commitSave(tags);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, tags]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const suggestions = (() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return allTags.filter((t) => t.toLowerCase().includes(q) && !tags.includes(t)).slice(0, 8);
  })();
  const showCreate = input.trim() && !allTags.includes(input.trim()) && !tags.includes(input.trim());

  const addTag = (tag: string) => {
    const clean = tag.trim().slice(0, 50);
    if (!clean || tags.includes(clean)) return;
    setTags((prev) => [...prev, clean]);
    setInput("");
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const commitSave = async (finalTags: string[]) => {
    if (saving) return;
    setSaving(true);
    setEditing(false);
    setInput("");
    try {
      await fetch(`/api/fax/${faxId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: finalTags }),
      });
      onSaved(finalTags);
    } finally {
      setSaving(false);
    }
  };

  // View mode
  if (!editing) {
    return (
      <div
        className="min-h-[22px] cursor-text group"
        onDoubleClick={(e) => { e.preventDefault(); setEditing(true); }}
        title="Double-click to add labels"
      >
        {tags.length === 0 ? (
          <span className="text-slate-300 text-xs group-hover:text-slate-400 transition-colors select-none">+ label</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div ref={containerRef} className="relative min-w-[160px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1 p-1.5 border border-blue-400 rounded-md bg-white shadow-sm min-h-[34px] focus-within:ring-2 focus-within:ring-blue-200">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 border border-violet-200"
          >
            {t}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); removeTag(t); }}
              className="hover:text-violet-900 leading-none ml-0.5"
              aria-label={`Remove ${t}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === "Backspace" && !input && tags.length) {
              removeTag(tags[tags.length - 1]);
            }
            if (e.key === "Escape") commitSave(tags);
          }}
          placeholder={tags.length ? "" : "Type a label…"}
          className="flex-1 min-w-[80px] outline-none text-xs bg-transparent py-0.5"
        />
      </div>

      {/* Autocomplete dropdown */}
      {(suggestions.length > 0 || showCreate) && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg z-50 py-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 text-slate-700 flex items-center gap-2"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-violet-400 shrink-0" />
              {s}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(input); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 text-slate-500 border-t border-slate-100 flex items-center gap-2"
            >
              <span className="inline-block w-2 h-2 rounded-full border border-violet-400 shrink-0" />
              Create &ldquo;<span className="font-semibold text-violet-700">{input.trim()}</span>&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-select tag filter dropdown ────────────────────────────────────────

function TagFilterDropdown({
  allTags,
  selected,
  onChange,
}: {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (tag: string) =>
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-sm border rounded-md px-3 py-2 flex items-center gap-1.5 transition-colors ${
          active
            ? "border-violet-400 text-violet-700 bg-violet-50"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
      >
        <Tag className="h-3.5 w-3.5" />
        {active ? `${selected.length} label${selected.length > 1 ? "s" : ""}` : "Labels"}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50 min-w-[180px] py-1">
          {allTags.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No labels yet</p>
          ) : (
            allTags.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(tag)}
                  onChange={() => toggle(tag)}
                  className="rounded accent-violet-600 h-3.5 w-3.5 shrink-0"
                />
                <span className="text-xs text-slate-700">{tag}</span>
              </label>
            ))
          )}
          {active && (
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 border-t border-slate-100 hover:bg-slate-50"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi-select party filter (sender or recipient numbers) ─────────────
//
// A combobox that lists every counterparty number visible to the user, with
// a substring ("wildcard") search input — typing "123" matches both "5551234"
// and "1234567". Selecting multiple values applies OR semantics on the server.

function PartyFilterDropdown({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Substring match against either the digits-only stored value OR its pretty form.
  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    const qDigits = q.replace(/\D/g, "");
    return options.filter((n) => {
      const stored = n.toLowerCase();
      const pretty = formatPhone(n).toLowerCase();
      if (stored.includes(q) || pretty.includes(q)) return true;
      if (qDigits && stored.replace(/\D/g, "").includes(qDigits)) return true;
      return false;
    });
  })();

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-sm border rounded-md px-3 py-2 flex items-center gap-1.5 transition-colors ${
          active
            ? "border-blue-400 text-blue-700 bg-blue-50"
            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
        }`}
      >
        {active ? `${selected.length} selected` : placeholder}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50 w-72 py-1">
          <div className="px-2 py-1.5 border-b border-slate-100">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search number…"
              className="h-8 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No matches</p>
            ) : (
              filtered.map((n) => (
                <label
                  key={n}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(n)}
                    onChange={() => toggle(n)}
                    className="rounded accent-blue-600 h-3.5 w-3.5 shrink-0"
                  />
                  <span className="text-xs text-slate-700 font-mono">{formatPhone(n) || n}</span>
                </label>
              ))
            )}
          </div>
          {active && (
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 border-t border-slate-100 hover:bg-slate-50"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main FaxList ─────────────────────────────────────────────────────────────

export function FaxList({ direction, basePath, accounts = [] }: FaxListProps) {
  const [items, setItems] = useState<FaxListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [didFilter, setDidFilter] = useState("");      // exact own-DID match
  const [partyFilter, setPartyFilter] = useState<string[]>([]);  // counterparty numbers (multi-select)
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortField>("submitTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // All distinct tags this user has applied (for autocomplete + filter dropdown)
  const [allTags, setAllTags] = useState<string[]>([]);
  // All distinct counterparty numbers (sender for inbox, recipient for sent)
  const [allParties, setAllParties] = useState<string[]>([]);
  const pageSize = 20;

  // ── Contact name enrichment ─────────────────────────────────────────────────
  // Extract all unique counterparty numbers from the current page, then batch-
  // resolve them against the contacts store.  Contact names always take priority
  // over whatever name was stored on the fax record, and work retroactively.
  const allFaxNumbers = useMemo(() => {
    if (direction === "received") {
      return items.map((item) => item.senderFaxNumber).filter(Boolean);
    }
    return items
      .flatMap((item) => (item.recipients ?? []).map((r) => r.faxNumber))
      .filter(Boolean);
  }, [items, direction]);
  const contactNames = useContactNames(allFaxNumbers);

  // ── SSE live updates ────────────────────────────────────────────────────────
  // Tracks in-flight faxes relevant to this direction from the shared SSE broker.
  const [activeFaxes, setActiveFaxes] = useState<SseLiveFax[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  // Keep a stable ref to fetchItems so the SSE effect doesn't re-subscribe on every filter change
  const fetchItemsRef = useRef<() => void>(() => {/* noop */});
  // Tracks which handles were active in the last SSE tick to detect completions
  const prevHandleSetRef = useRef<Set<string>>(new Set());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    fetch("/api/fax/tags")
      .then((r) => r.json())
      .then((data) => setAllTags(data.tags || []))
      .catch(() => {/* non-fatal */});
  }, []);

  // Load distinct counterparty numbers whenever direction changes
  useEffect(() => {
    fetch(`/api/fax/parties?direction=${direction}`)
      .then((r) => r.json())
      .then((data) => setAllParties(data.numbers || []))
      .catch(() => {/* non-fatal */});
  }, [direction]);

  const fetchItems = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({
      direction,
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
      ...(search ? { search } : {}),
      ...(didFilter ? { did: didFilter } : {}),
      ...(partyFilter.length ? { party: partyFilter.join(",") } : {}),
      ...(tagFilter.length ? { tags: tagFilter.join(",") } : {}),
    });
    fetch(`/api/fax?${p}`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [direction, page, search, didFilter, partyFilter, tagFilter, sortBy, sortDir]);

  // Keep the ref in sync with the latest fetchItems so SSE can call it without
  // being in its dependency array (avoids reconnecting on every filter change).
  useEffect(() => { fetchItemsRef.current = fetchItems; }, [fetchItems]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── SSE subscription ────────────────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/sse/status");
    setSseConnected(false);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = (event: MessageEvent) => {
      let data: { type: string; activeFaxes?: SseLiveFax[] };
      try { data = JSON.parse(event.data as string); } catch { return; }
      if (data.type !== "status_update") return;

      const all: SseLiveFax[] = data.activeFaxes ?? [];
      // Filter to faxes relevant to the tab we're on
      const sseDir = direction === "received" ? "inbound" : "outbound";
      const relevant = all.filter((f) => f.direction === sseDir);
      setActiveFaxes(relevant);

      const currentHandles = new Set(relevant.map((f) => f.messageHandle));
      const prev = prevHandleSetRef.current;

      // Detect handles that were active and just disappeared → fax completed
      const dropped = [...prev].filter((h) => !currentHandles.has(h));
      if (dropped.length > 0) {
        // Wait a few seconds for the queue poller to finish writing to Cosmos
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => fetchItemsRef.current(), 4_000);
      }

      // For sent: update status badges inline so they reflect live SSE state
      if (direction === "sent" && relevant.length > 0) {
        setItems((prev) =>
          prev.map((item) => {
            const live = relevant.find(
              (f) => f.messageHandle.replace(/[/\\#?]/g, "_").toLowerCase() === item.id
            );
            if (!live) return item;
            const liveStatus = live.status === "queued" ? "queued" : "sending";
            return item.status !== liveStatus ? { ...item, status: liveStatus } : item;
          })
        );
      }

      prevHandleSetRef.current = currentHandles;
    };

    return () => {
      es.close();
      setSseConnected(false);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [direction]); // only re-connect when direction changes

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  // When a tag is saved inline, refresh allTags if new tags were introduced
  const handleTagSaved = (faxId: string, newTags: string[]) => {
    setItems((prev) =>
      prev.map((item) => (item.id === faxId ? { ...item, tags: newTags } : item))
    );
    const merged = [...new Set([...allTags, ...newTags])].sort((a, b) => a.localeCompare(b));
    if (merged.length !== allTags.length) setAllTags(merged);
  };

  const totalPages = Math.ceil(total / pageSize);

  const statusColors: Record<string, string> = {
    received: "bg-blue-50 text-blue-600",
    sent: "bg-emerald-50 text-emerald-600",
    sending: "bg-amber-50 text-amber-600",
    queued: "bg-slate-100 text-slate-600",
    failed: "bg-red-50 text-red-600",
  };

  const accountFaxMap = new Map(accounts.map((a) => [a.accountGuid, a.faxNumber]));

  // Flatten linked accounts into a unique sorted list of DIDs (one entry per phone number).
  const allDIDs = Array.from(
    new Set(
      accounts.flatMap((a) =>
        (a.faxNumber || "")
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
      )
    )
  ).sort();

  const thSort = "px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 cursor-pointer select-none whitespace-nowrap hover:text-slate-600 transition-colors";
  const thStatic = "px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400";

  // Extra cols: sent has "Subject" + "Sent From" + "Duration"; received has "To" + "Duration"
  const colSpan = direction === "sent" ? 8 : 7;

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={direction === "received" ? "Search from / to / subject…" : "Search recipient / subject…"}
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* DID filter — only when user has more than one DID */}
        {allDIDs.length > 1 && (
          <select
            className="text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
            value={didFilter}
            onChange={(e) => { setDidFilter(e.target.value); setPage(1); }}
            title={direction === "received" ? "Filter by receiving number" : "Filter by sending number"}
          >
            <option value="">{direction === "received" ? "All my numbers" : "All my numbers"}</option>
            {allDIDs.map((d) => (
              <option key={d} value={d}>{formatPhone(d)}</option>
            ))}
          </select>
        )}

        {/* Counterparty filter (sender for inbox, recipient for sent) — multi-select */}
        <PartyFilterDropdown
          options={allParties}
          selected={partyFilter}
          onChange={(v) => { setPartyFilter(v); setPage(1); }}
          placeholder={direction === "received" ? "Filter by sender…" : "Filter by recipient…"}
        />

        {/* Active party filter chips */}
        {partyFilter.map((p) => (
          <span
            key={p}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200 font-mono"
          >
            {formatPhone(p) || p}
            <button
              type="button"
              onClick={() => { setPartyFilter((prev) => prev.filter((x) => x !== p)); setPage(1); }}
              aria-label={`Remove ${p} filter`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        {/* Multi-select label filter */}
        <TagFilterDropdown
          allTags={allTags}
          selected={tagFilter}
          onChange={(t) => { setTagFilter(t); setPage(1); }}
        />

        {/* Active tag filter chips */}
        {tagFilter.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-violet-100 text-violet-700 border border-violet-200"
          >
            {t}
            <button
              type="button"
              onClick={() => { setTagFilter((prev) => prev.filter((x) => x !== t)); setPage(1); }}
              aria-label={`Remove ${t} filter`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        <span className="text-sm text-slate-400 ml-auto flex items-center gap-3">
          {sseConnected && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
          {total} total
          <button
            type="button"
            title="Refresh"
            onClick={() => fetchItemsRef.current()}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      {/* Active-fax banner */}
      {activeFaxes.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0" />
          <span className="text-amber-800 text-sm font-medium">
            {direction === "received"
              ? `${activeFaxes.length} fax${activeFaxes.length > 1 ? "es" : ""} incoming`
              : `${activeFaxes.length} fax${activeFaxes.length > 1 ? "es" : ""} in progress`}
          </span>
          <div className="flex flex-wrap gap-2">
            {activeFaxes.map((f) => {
              const recipients = f.recipients ?? [];
              const first = recipients[0];
              const party = first?.address || "Unknown";
              // Aggregate page totals across ALL recipients to avoid "10/5"
              const totalPg = recipients.reduce((s, r) => s + (r.pageCount || 0), 0);
              const txPg = recipients.reduce((s, r) => s + (r.pagesTransferred || 0), 0);
              const pageInfo = totalPg > 0 ? ` · ${txPg}/${totalPg} pp` : "";
              const extra = recipients.length - 1;
              const label = `${formatPhone(party) || party}${extra > 0 ? ` +${extra}` : ""}`;
              // Tooltip lists every recipient with its own progress
              const tooltip = recipients.length > 1
                ? recipients
                    .map((r) => `${formatPhone(r.address) || r.address}: ${r.pagesTransferred || 0}/${r.pageCount || "?"}`)
                    .join("\n")
                : undefined;
              return (
                <span
                  key={f.messageHandle}
                  title={tooltip}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-mono border border-amber-200"
                >
                  {direction === "received" ? "←" : "→"} {label}{pageInfo}
                </span>
              );
            })}
          </div>
          <span className="text-amber-600 text-xs ml-auto">Refreshes automatically when done</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className={thSort} onClick={() => toggleSort("senderFaxNumber")}>
                {direction === "received" ? "From" : "To"} <SortIcon field="senderFaxNumber" sortBy={sortBy} sortDir={sortDir} />
              </th>
              {direction === "received" && (
                <th className={thSort} onClick={() => toggleSort("receivedToFaxNumber")}>
                  To <SortIcon field="receivedToFaxNumber" sortBy={sortBy} sortDir={sortDir} />
                </th>
              )}
              {direction === "sent" && <th className={thStatic}>Subject</th>}
              <th className={thStatic}>Labels</th>
              <th className={thStatic}>Pages</th>
              {direction === "sent" && <th className={thStatic}>Sent From</th>}
              {direction === "sent" && <th className={thStatic}>Duration</th>}
              {direction === "received" && <th className={thStatic}>Duration</th>}
              <th className={thStatic}>Status</th>
              <th className={thSort} onClick={() => toggleSort("submitTime")}>
                Date <SortIcon field="submitTime" sortBy={sortBy} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={colSpan} className="px-5 py-8 text-center text-sm text-slate-400">No faxes found</td></tr>
            ) : items.map((item) => (
              <tr
                key={item.id}
                className={`hover:bg-slate-50 transition-colors ${!item.isRead && direction === "received" ? "font-semibold" : ""}`}
              >
                {/* From / To — contact name (live-resolved) takes priority over stored name */}
                <td className="px-5 py-3">
                  <Link href={`${basePath}/${item.id}`} className="block text-sm">
                    <div className="flex items-center gap-2">
                      {!item.isRead && direction === "received" && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                      )}
                      {direction === "received"
                        ? (() => {
                            const num = item.senderFaxNumber
                              || item.recipients?.[0]?.callerID
                              || item.recipients?.[0]?.remoteCsid
                              || "";
                            const contactName = num ? contactNames[normalizePhone(num)]?.name : undefined;
                            const displayName = contactName || item.senderName || "";
                            const formatted = formatPhone(num);
                            if (!displayName && !formatted) return "Unknown";
                            if (displayName && formatted && displayName !== formatted) {
                              return (
                                <span>
                                  {displayName} <span className="text-slate-400 font-normal font-mono text-xs">· {formatted}</span>
                                </span>
                              );
                            }
                            return displayName || formatted;
                          })()
                        : (() => {
                            const r = item.recipients?.[0];
                            if (!r) return "Unknown";
                            const contactName = contactNames[normalizePhone(r.faxNumber)]?.name;
                            const name = contactName || r.name || "";
                            const num = formatPhone(r.faxNumber);
                            const label = name ? (
                              <span>
                                {name} <span className="text-slate-400 font-normal font-mono text-xs">· {num}</span>
                              </span>
                            ) : <span>{num}</span>;
                            const extra = (item.recipients?.length ?? 0) - 1;
                            if (extra <= 0) return label;
                            const tooltip = item.recipients
                              ?.map((rr) => {
                                const cn = contactNames[normalizePhone(rr.faxNumber)]?.name;
                                const n = cn || rr.name || "";
                                return n ? `${n} · ${formatPhone(rr.faxNumber)}` : formatPhone(rr.faxNumber);
                              })
                              .join("\n");
                            return (
                              <span title={tooltip}>
                                {label} <span className="text-slate-400">+{extra} more</span>
                              </span>
                            );
                          })()}
                    </div>
                  </Link>
                </td>

                {/* To (received only) */}
                {direction === "received" && (
                  <td className="px-5 py-3 text-sm text-slate-500">
                    <Link href={`${basePath}/${item.id}`} className="block">
                      {formatPhone(item.receivedToFaxNumber || "") || "—"}
                    </Link>
                  </td>
                )}

                {/* Subject (sent only — present when a cover page was used) */}
                {direction === "sent" && (
                  <td className="px-5 py-3 text-sm text-slate-500 max-w-[160px]">
                    <Link href={`${basePath}/${item.id}`} className="block truncate" title={item.subject || undefined}>
                      {item.subject || <span className="text-slate-300">—</span>}
                    </Link>
                  </td>
                )}

                {/* Labels (editable) */}
                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                  <TagCell
                    faxId={item.id}
                    initialTags={item.tags ?? []}
                    allTags={allTags}
                    onSaved={(newTags) => handleTagSaved(item.id, newTags)}
                  />
                </td>

                {/* Pages */}
                <td className="px-5 py-3 text-sm text-slate-500">
                  <Link href={`${basePath}/${item.id}`} className="block">
                    {item.documents?.reduce((sum, d) => sum + d.pageCount, 0) || item.recipients?.[0]?.pageCount || "—"}
                  </Link>
                </td>

                {direction === "sent" && (
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {(() => {
                      // Prefer the explicit sender DID stored on the message (set when the
                      // user picked a specific outbound number). Fall back to the account's
                      // first configured DID when the message predates that field.
                      if (item.senderFaxNumber) return formatPhone(item.senderFaxNumber);
                      const acctFax = item.sentFromAccountGuid
                        ? accountFaxMap.get(item.sentFromAccountGuid)
                        : null;
                      const firstDID = (acctFax || "").split(",")[0]?.trim();
                      return firstDID ? formatPhone(firstDID) : "—";
                    })()}
                  </td>
                )}
                {direction === "sent" && (
                  <td className="px-5 py-3 text-sm text-slate-400 font-mono">
                    {(() => {
                      const secs = item.recipients?.reduce((s, r) => s + (r.totalSeconds || 0), 0) || 0;
                      if (!secs) return "—";
                      const m = Math.floor(secs / 60);
                      const s = secs % 60;
                      return `${m}:${String(s).padStart(2, "0")}`;
                    })()}
                  </td>
                )}
                {direction === "received" && (
                  <td className="px-5 py-3 text-sm text-slate-400 font-mono">
                    <Link href={`${basePath}/${item.id}`} className="block">
                      {(() => {
                        const secs = item.recipients?.reduce((s, r) => s + (r.totalSeconds || 0), 0) || 0;
                        if (!secs) return "—";
                        const m = Math.floor(secs / 60);
                        const s = secs % 60;
                        return `${m}:${String(s).padStart(2, "0")}`;
                      })()}
                    </Link>
                  </td>
                )}

                {/* Status */}
                <td className="px-5 py-3">
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[item.status] || ""}`}>
                    {item.status}
                  </Badge>
                </td>

                {/* Date */}
                <td className="px-5 py-3 text-sm text-slate-400 whitespace-nowrap">
                  <Link href={`${basePath}/${item.id}`} className="block">
                    {new Date(item.submitTime).toLocaleDateString()}{" "}
                    {new Date(item.submitTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
