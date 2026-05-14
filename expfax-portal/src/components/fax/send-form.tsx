"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Send, Paperclip, ChevronDown, ChevronUp, X, Upload, Plus, Image as ImageIcon, Eye, Check, GripVertical, Loader2, Clock, ArrowUpRight, ArrowDownLeft, User } from "lucide-react";
import { FaxPreviewModal, type CoverPreviewInfo } from "./fax-preview-modal";
import { normalizePhone, formatPhone, formatOnBlur } from "@/lib/phone";
import type { RecentNumber } from "@/app/api/fax/recent-numbers/route";

// ─── Recipient fax number input with contact + recent-history autocomplete ────

interface ContactSuggestion {
  faxNumber: string;
  name: string;
  company: string;
}

function RecipientFaxInput({
  value,
  onChange,
  onBlur,
  recentNumbers,
  onSelectSuggestion,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: (v: string) => void;
  recentNumbers: RecentNumber[];
  /** Called when the user picks a suggestion — passes faxNumber, name, and
   *  (when from contacts) company so the caller can autofill cover page fields. */
  onSelectSuggestion: (faxNumber: string, name: string, company?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Internal display state — allows letters/names while typing without normalizing.
  // The parent's `value` prop is the "committed" normalized phone number; rawInput
  // is what the <input> actually shows. We only commit (call onChange/onBlur) when
  // the user blurs or selects a suggestion.
  const [rawInput, setRawInput] = useState(() => formatPhone(value) || value);

  // Sync display when the parent pushes a new committed value (e.g. after selection
  // or external programmatic change). Only update if the committed number changed.
  const prevCommittedRef = useRef(value);
  useEffect(() => {
    if (value !== prevCommittedRef.current) {
      prevCommittedRef.current = value;
      setRawInput(formatPhone(value) || value);
    }
  }, [value]);

  // Debounced contact search — fires on every keystroke using the RAW display value
  useEffect(() => {
    const q = rawInput.trim();
    if (!q) {
      setContactSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/contacts?search=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((data) =>
          setContactSuggestions(
            (data.items ?? []).slice(0, 6).map((c: { faxNumber: string; name: string; company?: string }) => ({
              faxNumber: c.faxNumber,
              name: c.name,
              company: c.company || "",
            }))
          )
        )
        .catch(() => setContactSuggestions([]));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawInput]);

  // Filter recent-history suggestions — hide numbers already shown as contacts
  const contactNums = new Set(contactSuggestions.map((c) => c.faxNumber));
  const query = rawInput.replace(/\D/g, "");
  const recentSuggestions =
    query.length >= 1
      ? recentNumbers
          .filter((r) => {
            if (contactNums.has(r.faxNumber)) return false;
            const digits = r.faxNumber.replace(/\D/g, "");
            return (
              digits.includes(query) ||
              r.name.toLowerCase().includes(rawInput.toLowerCase())
            );
          })
          .slice(0, 5)
      : [];

  const showDropdown = focused && (contactSuggestions.length > 0 || recentSuggestions.length > 0);

  // Position dropdown using fixed coords to escape any overflow:hidden parent
  function openDropdown() {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
        zIndex: 9999,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (showDropdown) {
      openDropdown();
    } else {
      setOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown, rawInput]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        placeholder="Fax number or contact name…"
        value={rawInput}
        onChange={(e) => setRawInput(e.target.value)}
        onBlur={(e) => {
          // Normalize on blur so the parent always stores a clean phone number
          const normalized = normalizePhone(e.target.value);
          const display = formatPhone(normalized) || normalized || e.target.value;
          setRawInput(display);
          prevCommittedRef.current = normalized;
          onChange(normalized);
          onBlur(e.target.value);
          setTimeout(() => setFocused(false), 150);
        }}
        onFocus={() => setFocused(true)}
        autoComplete="off"
        className="w-full"
      />
      {open && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white border border-slate-200 rounded-lg shadow-xl py-1 overflow-hidden max-h-72 overflow-y-auto"
        >
          {/* Contacts section */}
          {contactSuggestions.length > 0 && (
            <>
              <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <User className="h-3 w-3" /> Contacts
              </p>
              {contactSuggestions.map((c) => (
                <button
                  key={c.faxNumber}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setRawInput(formatPhone(c.faxNumber));
                    prevCommittedRef.current = c.faxNumber;
                    onSelectSuggestion(c.faxNumber, c.name, c.company);
                    setOpen(false);
                    setFocused(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 text-left transition-colors"
                >
                  <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{formatPhone(c.faxNumber)}{c.company ? ` · ${c.company}` : ""}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Recent history section */}
          {recentSuggestions.length > 0 && (
            <>
              {contactSuggestions.length > 0 && <div className="border-t border-slate-100 my-0.5" />}
              <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent
              </p>
              {recentSuggestions.map((s) => (
                <button
                  key={s.faxNumber}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setRawInput(formatPhone(s.faxNumber));
                    prevCommittedRef.current = s.faxNumber;
                    onSelectSuggestion(s.faxNumber, s.name);
                    setOpen(false);
                    setFocused(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left transition-colors"
                >
                  {s.direction === "sent" ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  ) : (
                    <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="font-mono text-sm text-slate-800 shrink-0">{formatPhone(s.faxNumber)}</span>
                  {s.name && (
                    <span className="text-xs text-slate-400 truncate ml-1">{s.name}</span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Renders a small thumbnail for image File objects, revoking the object URL on cleanup. */
function FileThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? (
    <img src={url} alt="" className="h-10 w-10 object-cover rounded border border-slate-200 shrink-0" />
  ) : (
    <ImageIcon className="h-4 w-4 text-blue-400 shrink-0" />
  );
}

interface Recipient {
  faxNumber: string;
  name: string;
}

interface FromAccount {
  accountGuid: string;
  accountId: string;
  faxNumber: string | null;
  label: string | null;
}

/** A single selectable "send from" choice — one per DID per linked FaxBack account.
 *  An account whose `faxNumber` is comma-separated produces multiple options. */
interface FromOption {
  key: string;          // unique: `${accountGuid}|${faxNumber}` (faxNumber may be "")
  accountGuid: string;
  accountId: string;
  faxNumber: string;    // single DID, may be "" if account has no DIDs configured
  label: string | null;
}

function expandToOptions(accounts: FromAccount[]): FromOption[] {
  const out: FromOption[] = [];
  for (const a of accounts) {
    const nums = (a.faxNumber || "").split(",").map((n) => n.trim()).filter(Boolean);
    if (nums.length === 0) {
      out.push({ key: `${a.accountGuid}|`, accountGuid: a.accountGuid, accountId: a.accountId, faxNumber: "", label: a.label });
    } else {
      for (const n of nums) {
        out.push({ key: `${a.accountGuid}|${n}`, accountGuid: a.accountGuid, accountId: a.accountId, faxNumber: n, label: a.label });
      }
    }
  }
  return out;
}

interface SendFormProps {
  coverTemplates: Array<{
    id: string;
    templateName: string;
    bodyText: string;
    isDefault: boolean;
    headerImageBase64?: string;
    headerImageType?: "png" | "jpeg";
  }>;
  fromAccounts?: FromAccount[];         // All linked FaxBack accounts for the user
  defaultAccountGuid?: string | null;   // Which to pre-select
}

const RESOLUTION_OPTIONS = [
  { value: "0", label: "Standard (200×100 DPI)" },
  { value: "2", label: "Fine (200×200 DPI)" },
  { value: "3", label: "Superfine (200×400 DPI)" },
];

// ─── Account picker dropdown ──────────────────────────────────────────────────

function AccountPicker({
  options,
  value,
  onChange,
}: {
  options: FromOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.key === value) ?? options[0];

  // Position the fixed dropdown under the trigger button
  function openDropdown() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function displayName(o: FromOption) {
    // From the user's perspective there is no "account" — only the phone number.
    // Fall back to label/accountId only when no DID is configured (rare).
    return o.faxNumber ? formatPhone(o.faxNumber) : (o.label || o.accountId);
  }

  // Single option — just display, no dropdown needed
  if (options.length === 1) {
    const only = options[0];
    return (
      <div className="px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50">
        <p className="text-sm font-medium text-slate-800 font-mono">{displayName(only)}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 border border-slate-200 rounded-lg bg-white hover:border-slate-300 transition-colors text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate font-mono">{selected ? displayName(selected) : "Select number"}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown — rendered with fixed positioning to escape overflow:hidden ancestors */}
      {open && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white border border-slate-200 rounded-lg shadow-xl py-1 overflow-hidden max-h-80 overflow-y-auto"
        >
          {options.map((o) => {
            const isSelected = o.key === value;
            return (
              <button
                key={o.key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.key);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate font-mono ${isSelected ? "text-blue-700" : "text-slate-800"}`}>
                    {displayName(o)}
                  </p>
                </div>
                {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


export function SendForm({ coverTemplates, fromAccounts = [], defaultAccountGuid }: SendFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resendFrom = searchParams?.get("resendFrom") ?? null;
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resendLoading, setResendLoading] = useState(!!resendFrom);

  // Expand each linked account into one option per DID (multi-DID accounts produce multiple rows).
  const fromOptions = expandToOptions(fromAccounts);
  // Selected option key: `${accountGuid}|${faxNumber}`
  const [fromOptionKey, setFromOptionKey] = useState<string>(() => {
    const preferred = defaultAccountGuid
      ? fromOptions.find((o) => o.accountGuid === defaultAccountGuid)
      : undefined;
    return (preferred ?? fromOptions[0])?.key ?? "";
  });
  const selectedFromOption = fromOptions.find((o) => o.key === fromOptionKey);

  // Recent fax numbers for autocomplete
  const [recentNumbers, setRecentNumbers] = useState<RecentNumber[]>([]);
  useEffect(() => {
    fetch("/api/fax/recent-numbers")
      .then((r) => r.ok ? r.json() : { numbers: [] })
      .then((d) => setRecentNumbers(d.numbers ?? []))
      .catch(() => {/* non-critical */});
  }, []);

  // Per-number sender profiles from settings (for cover page auto-fill)
  const [numberProfiles, setNumberProfiles] = useState<Record<string, { senderName: string; senderCompany: string }>>({});
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : {})
      .then((d) => setNumberProfiles(d.preferences?.numberProfiles || {}))
      .catch(() => {/* non-critical */});
  }, []);

  // Recipients (array of rows — always at least one)
  const [recipients, setRecipients] = useState<Recipient[]>([{ faxNumber: "", name: "" }]);
  const [subject, setSubject] = useState("");

  // Cover page
  const [useCover, setUseCover] = useState(false);
  // Selected template ID ("") = none — template provides letterhead + default body text
  const defaultTemplate = coverTemplates.find((t) => t.isDefault);
  const [coverTemplateId, setCoverTemplateId] = useState(defaultTemplate?.id ?? "");

  /**
   * Derive which cover fields are REQUIRED based on the placeholders that
   * appear in the selected template's bodyText. A field is required only if
   * the cover is enabled, a template is selected, and that placeholder is in
   * the template body.
   */
  const requiredCoverFields = (() => {
    const set = new Set<"senderName" | "senderCompany" | "senderFax" | "senderVoice" | "receiverName" | "receiverCompany" | "subject" | "comments">();
    if (!useCover || !coverTemplateId) return set;
    const tpl = coverTemplates.find((t) => t.id === coverTemplateId);
    const body = tpl?.bodyText || "";
    const tokenToField: Record<string, Parameters<typeof set.add>[0]> = {
      SenderName: "senderName",
      SenderCompany: "senderCompany",
      SenderFax: "senderFax",
      SenderVoice: "senderVoice",
      ReceiverName: "receiverName",
      ReceiverCompany: "receiverCompany",
      Subject: "subject",
      // Comments / Cover are intentionally excluded — comments are always optional.
    };
    const re = /\$\(([A-Za-z]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const f = tokenToField[m[1]];
      if (f) set.add(f);
    }
    return set;
  })();
  const req = (k: "senderName" | "senderCompany" | "senderFax" | "senderVoice" | "receiverName" | "receiverCompany" | "subject" | "comments") => requiredCoverFields.has(k);
  // One-time cover page fields
  const [oneTimeCover, setOneTimeCover] = useState({
    senderName: "",
    senderCompany: "",
    senderFax: "",
    senderVoice: "",
    receiverName: "",
    receiverCompany: "",
    message: "",
  });

  // Files
  const [files, setFiles] = useState<File[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Drag-to-reorder state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Advanced
  const [resolution, setResolution] = useState("0"); // 0=Standard, 2=Fine, 3=Superfine
  const [scheduleTime, setScheduleTime] = useState("");
  const [billingCode, setBillingCode] = useState("");

  // Auto-fill cover page sender fields from per-number settings whenever the
  // selected "from" number changes (or when profiles load after the form mounts).
  useEffect(() => {
    const faxNum = selectedFromOption?.faxNumber ?? "";
    const profile = faxNum ? numberProfiles[faxNum] : undefined;
    setOneTimeCover((v) => ({
      ...v,
      senderFax: faxNum ? formatOnBlur(faxNum) : v.senderFax,
      senderName: profile?.senderName ?? v.senderName,
      senderCompany: profile?.senderCompany ?? v.senderCompany,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromOptionKey, numberProfiles]);

  // ── Pre-populate form when arriving from "Send Again" on a failed fax ──────
  useEffect(() => {
    if (!resendFrom) return;
    setResendLoading(true);

    (async () => {
      try {
        const faxRes = await fetch(`/api/fax/${resendFrom}`);
        if (!faxRes.ok) return;
        const fax = await faxRes.json();

        // Pre-fill recipients
        if (Array.isArray(fax.recipients) && fax.recipients.length > 0) {
          setRecipients(
            fax.recipients.map((r: { faxNumber: string; name?: string }) => ({
              faxNumber: r.faxNumber ?? "",
              name: r.name ?? "",
            }))
          );
        }

        // Pre-fill subject
        if (fax.subject) setSubject(fax.subject);

        // Pre-fill from account (match by sentFromAccountGuid)
        if (fax.sentFromAccountGuid) {
          const match = fromOptions.find((o) => o.accountGuid === fax.sentFromAccountGuid);
          if (match) setFromOptionKey(match.key);
        }

        // Download stored documents and create File objects
        const sentPaths: string[] = Array.isArray(fax.sentDocumentPaths) ? fax.sentDocumentPaths : [];
        const docMeta: Array<{ name: string }> = Array.isArray(fax.documents) ? fax.documents : [];

        const loadedFiles = await Promise.all(
          sentPaths.map(async (_, i) => {
            const name = docMeta[i]?.name ?? `document_${i + 1}`;
            const ext = name.split(".").pop()?.toLowerCase() ?? "bin";
            const mimeType =
              ext === "pdf" ? "application/pdf" :
              ext === "tiff" || ext === "tif" ? "image/tiff" :
              "application/octet-stream";
            try {
              const dlRes = await fetch(`/api/fax/${resendFrom}/download?sentdoc=${i}`);
              if (!dlRes.ok) return null;
              const blob = await dlRes.blob();
              return new File([blob], name, { type: mimeType });
            } catch {
              return null;
            }
          })
        );

        const validFiles = loadedFiles.filter((f): f is File => f !== null);
        if (validFiles.length > 0) setFiles(validFiles);
      } finally {
        setResendLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resendFrom]);

  // --- Recipient helpers ---
  function addRecipient() {
    setRecipients((prev) => [...prev, { faxNumber: "", name: "" }]);
  }

  function removeRecipient(index: number) {
    if (recipients.length <= 1) return; // keep at least one
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRecipient(index: number, field: keyof Recipient, value: string) {
    setRecipients((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  // --- File helpers ---
  /**
   * Filters out file types FaxBack cannot reliably render and shows a friendly
   * toast guiding the user to export them first. Spreadsheets (.xls/.xlsx) have
   * no natural page breaks — even when FaxBack accepts them the result depends
   * entirely on the file's print settings, so we require the user to export to
   * PDF (which preserves their chosen print area / page setup).
   */
  const filterAndWarn = useCallback((incoming: File[]): File[] => {
    const accepted: File[] = [];
    const excelRejected: string[] = [];
    for (const f of incoming) {
      const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
      if (ext === ".xls" || ext === ".xlsx") {
        excelRejected.push(f.name);
        continue;
      }
      accepted.push(f);
    }
    if (excelRejected.length) {
      toast.error(
        excelRejected.length === 1
          ? `Excel files aren't supported: ${excelRejected[0]}`
          : `Excel files aren't supported (${excelRejected.length} skipped)`,
        {
          description:
            "Open the file in Excel → File → Save As / Export → PDF, then upload the PDF. This preserves your chosen print area and page breaks.",
          duration: 8000,
        }
      );
    }
    return accepted;
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const next = filterAndWarn(Array.from(e.target.files));
      if (next.length) setFiles((prev) => [...prev, ...next]);
    }
  }, [filterAndWarn]);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const moveFile = (from: number, to: number) => {
    if (to < 0 || to >= files.length) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const next = filterAndWarn(Array.from(e.dataTransfer.files));
      if (next.length) setFiles((prev) => [...prev, ...next]);
    }
  }, [filterAndWarn]);

  // --- Submit ---
  const validRecipients = recipients.filter((r) => r.faxNumber.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sendingRef.current) return;
    sendingRef.current = true;
    setError("");

    if (validRecipients.length === 0) {
      setError("At least one recipient fax number is required");
      sendingRef.current = false;
      return;
    }

    // Enforce required fields driven by template placeholders.
    if (useCover && coverTemplateId) {
      const checks: Array<[boolean, string, string]> = [
        [req("senderName"),      !oneTimeCover.senderName.trim()      ? "" : "ok", "Your Name"],
        [req("senderCompany"),   !oneTimeCover.senderCompany.trim()   ? "" : "ok", "Your Company"],
        [req("senderFax"),       !oneTimeCover.senderFax.trim()       ? "" : "ok", "Your Fax Number"],
        [req("senderVoice"),     !oneTimeCover.senderVoice.trim()     ? "" : "ok", "Your Voice Number"],
        [req("receiverName"),    !oneTimeCover.receiverName.trim()    ? "" : "ok", "Recipient Name"],
        [req("receiverCompany"), !oneTimeCover.receiverCompany.trim() ? "" : "ok", "Recipient Company"],
        [req("subject"),         !subject.trim()                       ? "" : "ok", "Subject"],
        [req("comments"),        !oneTimeCover.message.trim()         ? "" : "ok", "Comments"],
      ];
      const missing = checks.filter(([required, value]) => required && value !== "ok").map(([, , label]) => label);
      if (missing.length > 0) {
        setError(
          `The selected template uses placeholder${missing.length > 1 ? "s" : ""} that need values. Please fill in: ${missing.join(", ")}.`
        );
        sendingRef.current = false;
        return;
      }
    }

    setSending(true);

    try {
      // Convert files to base64
      const documents = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          return { name: file.name, contentBase64: base64 };
        })
      );

      const res = await fetch("/api/fax/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: validRecipients,
          subject,
          oneTimeCover: useCover ? { ...oneTimeCover, subject } : undefined,
          coverTemplateId: useCover ? (coverTemplateId || undefined) : undefined,
          documents,
          resolution: parseInt(resolution, 10),
          scheduleTime: scheduleTime || undefined,
          billingCode: billingCode || undefined,
          fromAccountGuid: selectedFromOption?.accountGuid || undefined,
          fromFaxNumber: selectedFromOption?.faxNumber || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to send fax");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/sent"), 2000);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (success) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Send className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Fax Queued!</h2>
          <p className="text-sm text-slate-500">
            Sending to {validRecipients.length} recipient{validRecipients.length > 1 ? "s" : ""}. Redirecting to sent items...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (resendLoading) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading fax details…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* From Account selector — always shown so the user knows which number they're sending from */}
      {fromOptions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Send From</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountPicker
              options={fromOptions}
              value={fromOptionKey}
              onChange={setFromOptionKey}
            />
          </CardContent>
        </Card>
      )}

      {/* Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recipients</CardTitle>
            <span className="text-xs text-slate-400">
              Sending to {validRecipients.length} recipient{validRecipients.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {recipients.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <RecipientFaxInput
                value={r.faxNumber}
                onChange={(v) => updateRecipient(i, "faxNumber", v)}
                onBlur={(v) => updateRecipient(i, "faxNumber", formatOnBlur(v))}
                recentNumbers={recentNumbers}
                onSelectSuggestion={(faxNumber, name, company) => {
                  updateRecipient(i, "faxNumber", faxNumber);
                  if (name) updateRecipient(i, "name", name);
                  // Autofill cover page receiver fields from the selected contact (always editable)
                  if (name || company) {
                    setOneTimeCover((v) => ({
                      ...v,
                      receiverName: name || v.receiverName,
                      receiverCompany: company || v.receiverCompany,
                    }));
                    // Auto-enable cover page so the user sees the autofilled fields
                    if (!useCover && (name || company)) setUseCover(true);
                  }
                }}
              />
              <Input
                placeholder="Recipient name (optional)"
                value={r.name}
                onChange={(e) => updateRecipient(i, "name", e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-slate-400 hover:text-red-500"
                onClick={() => removeRecipient(i)}
                disabled={recipients.length <= 1}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRecipient}>
            <Plus className="h-4 w-4 mr-1" /> Add Recipient
          </Button>

          <div className="space-y-2 pt-2">
            <Label htmlFor="subject">
              Subject{req("subject") && <span className="text-red-500 ml-0.5">*</span>}
            </Label>
            <Input
              id="subject"
              placeholder="Optional subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cover Page */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Cover Page</CardTitle>
            <Switch checked={useCover} onCheckedChange={setUseCover} />
          </div>
        </CardHeader>
        {useCover && (
          <CardContent>
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
              {/* Template selector */}
              {coverTemplates.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Template (letterhead + default message)</Label>
                  <select
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    value={coverTemplateId}
                    onChange={(e) => setCoverTemplateId(e.target.value)}
                  >
                    <option value="">No template (plain cover)</option>
                    {coverTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.templateName}{t.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Fill in the details for this cover page. It will be generated and sent as the first page of the fax.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Your Name{req("senderName") && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    placeholder="Sender name"
                    value={oneTimeCover.senderName}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Your Company{req("senderCompany") && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    placeholder="Company name"
                    value={oneTimeCover.senderCompany}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderCompany: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Your Fax Number{req("senderFax") && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    placeholder="(555) 123-4567"
                    value={oneTimeCover.senderFax}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderFax: normalizePhone(e.target.value) }))}
                    onBlur={(e) => setOneTimeCover((v) => ({ ...v, senderFax: formatOnBlur(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Your Voice Number{req("senderVoice") && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    placeholder="(555) 987-6543"
                    value={oneTimeCover.senderVoice}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderVoice: normalizePhone(e.target.value) }))}
                    onBlur={(e) => setOneTimeCover((v) => ({ ...v, senderVoice: formatOnBlur(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Recipient Name{req("receiverName") && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    placeholder="Recipient name"
                    value={oneTimeCover.receiverName}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, receiverName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Recipient Company{req("receiverCompany") && <span className="text-red-500 ml-0.5">*</span>}
                  </Label>
                  <Input
                    placeholder="Recipient company"
                    value={oneTimeCover.receiverCompany}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, receiverCompany: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {coverTemplateId ? "Comments" : "Cover Message"}
                  {req("comments") && <span className="text-red-500 ml-0.5">*</span>}
                </Label>
                <Textarea
                  placeholder={coverTemplateId
                    ? "Comments here will replace $(Comments) in the selected template."
                    : "Message to appear on the cover page..."}
                  value={oneTimeCover.message}
                  onChange={(e) => setOneTimeCover((v) => ({ ...v, message: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Fax Preview Modal */}
      <FaxPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        files={files}
        resolution={parseInt(resolution, 10)}
        cover={useCover ? (() => {
          const tpl = coverTemplates.find((t) => t.id === coverTemplateId);
          return {
            mode: "onetime" as const,
            senderName: oneTimeCover.senderName,
            senderCompany: oneTimeCover.senderCompany,
            senderFax: oneTimeCover.senderFax,
            senderVoice: oneTimeCover.senderVoice,
            receiverName: oneTimeCover.receiverName,
            receiverCompany: oneTimeCover.receiverCompany,
            subject,
            // The Comments textbox; substituted into $(Comments) in the template body.
            message: oneTimeCover.message,
            // Template's fixed body — placeholders substituted in the preview.
            templateBodyText: tpl?.bodyText,
            headerImageBase64: tpl?.headerImageBase64,
            headerImageType: tpl?.headerImageType,
          };
        })() : undefined}
      />

      {/* Attachments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Attachments</CardTitle>
            {(files.length > 0 || useCover) && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-4 w-4 mr-1" /> Preview Fax
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <Upload className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Drop files here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">
              PDF · TIFF · Word (DOCX) · RTF · TXT · HTML ·{" "}
              <span className="font-medium text-blue-500">PNG · JPEG · WEBP · BMP · GIF</span>
              {" "}— max 20 MB each
            </p>
            <p className="text-[11px] text-slate-300 mt-0.5">Images are converted to TIFF automatically</p>
            <input
              id="file-upload"
              type="file"
              multiple
              accept=".pdf,.tif,.tiff,.doc,.docx,.txt,.rtf,.html,.png,.jpg,.jpeg,.webp,.bmp,.gif,.dcx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, i) => {
                const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                const isImage = ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(ext);
                return (
                  <div
                    key={i}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); setDragIndex(i); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverIndex(i); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragIndex !== null && dragIndex !== i) moveFile(dragIndex, i);
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-all select-none ${
                      dragIndex === i
                        ? "opacity-40 bg-blue-50 border border-blue-200"
                        : dragOverIndex === i
                        ? "bg-blue-50 border border-blue-300 shadow-sm"
                        : "bg-slate-50 border border-transparent"
                    }`}
                  >
                    {/* Drag handle */}
                    <GripVertical className="h-4 w-4 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />

                    {/* Thumbnail or icon */}
                    {isImage
                      ? <FileThumb file={file} />
                      : <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />}

                    <span className="flex-1 truncate min-w-0">{file.name}</span>

                    {isImage && (
                      <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 shrink-0">
                        → TIFF
                      </span>
                    )}

                    <span className="text-xs text-slate-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>

                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Options */}
      <Card>
        <CardHeader className="pb-0 cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Advanced Options</CardTitle>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Resolution</Label>
                <select
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Schedule Send</Label>
                <Input type="datetime-local" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Billing Code</Label>
              <Input placeholder="Optional" value={billingCode} onChange={(e) => setBillingCode(e.target.value)} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Submit */}
      <Button type="submit" size="lg" className="w-full" disabled={sending || validRecipients.length === 0 || (files.length === 0 && !useCover)}>
        <Send className="h-4 w-4 mr-2" />
        {sending
          ? "Sending..."
          : `Send Fax${validRecipients.length > 1 ? ` to ${validRecipients.length} Recipients` : ""}`}
      </Button>
    </form>
  );
}
