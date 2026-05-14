"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ScrollText, Download, ChevronDown, X } from "lucide-react";

interface AuditEntry {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

const ACTION_GROUPS = [
  { label: "Auth",      actions: ["auth.login", "auth.login_failed", "auth.logout", "signup.complete"] },
  { label: "Fax",       actions: ["fax.send", "fax.received", "fax.delete", "fax.abort"] },
  { label: "Contacts",  actions: ["contact.create", "contact.update", "contact.delete"] },
  { label: "Templates", actions: ["template.upload", "template.delete"] },
  { label: "Admin",     actions: ["admin.user_link", "admin.role_change", "admin.email_config", "admin.retention_update", "admin.invitation_create", "admin.invitation_revoke", "admin.invitation_resend", "admin.mfa_mode_change", "admin.trusted_location_revoke"] },
] as const;

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Login", "auth.login_failed": "Login Failed", "auth.logout": "Logout", "signup.complete": "Signup",
  "fax.send": "Fax Send", "fax.received": "Fax Received", "fax.delete": "Fax Delete", "fax.abort": "Fax Abort",
  "contact.create": "Contact Create", "contact.update": "Contact Update", "contact.delete": "Contact Delete",
  "template.upload": "Template Upload", "template.delete": "Template Delete",
  "admin.user_link": "User Link", "admin.role_change": "Role Change", "admin.email_config": "Email Config",
  "admin.retention_update": "Retention Update", "admin.invitation_create": "Invitation Create",
  "admin.invitation_revoke": "Invitation Revoke", "admin.invitation_resend": "Invitation Resend",
  "admin.mfa_mode_change": "MFA Mode Change", "admin.trusted_location_revoke": "Trusted Location Revoke",
};

const actionColors: Record<string, string> = {
  "auth.login": "bg-emerald-50 text-emerald-700",
  "auth.login_failed": "bg-red-50 text-red-700",
  "auth.logout": "bg-slate-50 text-slate-600",
  "fax.send": "bg-blue-50 text-blue-700",
  "fax.received": "bg-purple-50 text-purple-700",
  "fax.delete": "bg-red-50 text-red-700",
  "fax.abort": "bg-orange-50 text-orange-700",
  "admin.user_link": "bg-amber-50 text-amber-700",
  "admin.role_change": "bg-amber-50 text-amber-700",
};

function detailSummary(action: string, detail: Record<string, unknown>, resourceId: string): string {
  if (action === "fax.send") {
    const parts: string[] = [];
    if (Array.isArray(detail.recipients) && detail.recipients.length)
      parts.push((detail.recipients as string[]).join(", "));
    if (typeof detail.pages === "number") parts.push(`${detail.pages} pages`);
    return parts.join(" · ");
  }
  if (action === "fax.abort" || action === "fax.delete") return resourceId.substring(0, 20);
  if (action.startsWith("contact.")) return typeof detail.name === "string" ? detail.name : resourceId.substring(0, 16);
  if (action === "admin.role_change") return typeof detail.role === "string" ? `→ ${detail.role}` : "";
  if (action === "admin.invitation_create" || action === "admin.invitation_revoke" || action === "admin.invitation_resend")
    return typeof detail.email === "string" ? detail.email : "";
  if (action === "signup.complete") return typeof detail.authType === "string" ? detail.authType : "";
  if (action === "admin.mfa_mode_change") return typeof detail.mfaMode === "string" ? detail.mfaMode : "";
  return "";
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterActions, setFilterActions] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pageSize = 50;

  const buildParams = useCallback((overrides?: Record<string, string>) => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filterActions.length > 0) p.set("actions", filterActions.join(","));
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo + "T23:59:59.999Z");
    Object.entries(overrides ?? {}).forEach(([k, v]) => p.set(k, v));
    return p;
  }, [page, filterActions, dateFrom, dateTo]);

  useEffect(() => {
    fetch(`/api/admin/audit?${buildParams()}`)
      .then(r => r.json())
      .then(data => {
        setEntries(data.items || []);
        setTotal(data.total || 0);
        setUsers(prev => ({ ...prev, ...(data.users || {}) }));
      });
  }, [buildParams]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleAction = (a: string) => {
    setFilterActions(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
    setPage(1);
  };

  const toggleGroup = (actions: readonly string[]) => {
    const allSelected = actions.every(a => filterActions.includes(a));
    setFilterActions(prev =>
      allSelected ? prev.filter(x => !actions.includes(x)) : [...new Set([...prev, ...actions])]
    );
    setPage(1);
  };

  const handleExport = async () => {
    const data = await fetch(`/api/admin/audit?${buildParams({ export: "true" })}`).then(r => r.json());
    const rows: AuditEntry[] = data.items || [];
    const allUsers: Record<string, string> = { ...users, ...(data.users || {}) };
    const csv = [
      ["Time", "Action", "User", "ResourceType", "ResourceId", "Detail", "IP"].join(","),
      ...rows.map(e => [
        e.timestamp,
        e.action,
        `"${(allUsers[e.userId] || e.userId).replace(/"/g, '""')}"`,
        e.resourceType,
        e.resourceId,
        `"${JSON.stringify(e.detail).replace(/"/g, '""')}"`,
        e.ipAddress,
      ].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterLabel = filterActions.length === 0
    ? "All Actions"
    : filterActions.length === 1
      ? (ACTION_LABEL[filterActions[0]] ?? filterActions[0])
      : `${filterActions.length} selected`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold">Audit Log</h2>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Multi-select action dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm hover:border-slate-300"
          >
            <span>{filterLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute z-20 mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm max-h-80 overflow-y-auto">
              <button
                className="w-full px-3 py-1.5 text-left hover:bg-slate-50 text-slate-500 text-xs"
                onClick={() => { setFilterActions([]); setPage(1); }}
              >
                Clear all
              </button>
              <div className="border-t border-slate-100 my-1" />
              {ACTION_GROUPS.map(group => (
                <div key={group.label}>
                  <button
                    className="w-full px-3 py-1.5 text-left font-semibold text-[11px] uppercase tracking-wider text-slate-400 hover:bg-slate-50"
                    onClick={() => toggleGroup(group.actions)}
                  >
                    {group.label}
                  </button>
                  {group.actions.map(a => (
                    <label key={a} className="flex items-center gap-2 px-4 py-1 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={filterActions.includes(a)}
                        onChange={() => toggleAction(a)}
                      />
                      <span className="text-slate-600">{ACTION_LABEL[a]}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1); }}
          className="px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600"
        />
        <span className="text-slate-400 text-xs">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1); }}
          className="px-2 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
            className="p-1 text-slate-400 hover:text-slate-600"
            title="Clear dates"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        <span className="text-sm text-slate-400 ml-auto">{total.toLocaleString()} entries</span>
      </div>

      {/* Active filter pills */}
      {filterActions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filterActions.map(a => (
            <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
              {ACTION_LABEL[a] ?? a}
              <button onClick={() => toggleAction(a)} className="hover:text-blue-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Time</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Action</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">User</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Detail</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <Badge className={`text-[10px] ${actionColors[e.action] || "bg-slate-50 text-slate-600"}`}>
                    {e.action}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-slate-600">
                  <span title={e.userId}>{users[e.userId] ?? `${e.userId.substring(0, 8)}…`}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={JSON.stringify(e.detail, null, 2)}>
                  {detailSummary(e.action, e.detail, e.resourceId)}
                </td>
                <td className="px-4 py-2.5 text-slate-400">{e.ipAddress}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No audit entries</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-slate-400">Page {page} of {Math.ceil(total / pageSize) || 1}</span>
        <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
