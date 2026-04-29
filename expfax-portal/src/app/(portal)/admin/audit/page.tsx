"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

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

const actionColors: Record<string, string> = {
  "auth.login": "bg-emerald-50 text-emerald-700",
  "auth.login_failed": "bg-red-50 text-red-700",
  "fax.send": "bg-blue-50 text-blue-700",
  "fax.received": "bg-purple-50 text-purple-700",
  "fax.delete": "bg-red-50 text-red-700",
  "admin.user_link": "bg-amber-50 text-amber-700",
  "admin.role_change": "bg-amber-50 text-amber-700",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAction, setFilterAction] = useState("");
  const pageSize = 50;

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filterAction) params.set("action", filterAction);
    fetch(`/api/admin/audit?${params}`).then((r) => r.json()).then((data) => {
      setEntries(data.items || []);
      setTotal(data.total || 0);
    });
  }, [page, filterAction]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold">Audit Log</h2>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <select className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          <option value="auth.login">Login</option>
          <option value="auth.login_failed">Login Failed</option>
          <option value="fax.send">Fax Send</option>
          <option value="fax.received">Fax Received</option>
          <option value="fax.delete">Fax Delete</option>
          <option value="admin.user_link">User Link</option>
          <option value="admin.role_change">Role Change</option>
          <option value="admin.email_config">Email Config</option>
        </select>
        <span className="text-sm text-slate-400">{total} entries</span>
      </div>

      {/* Entries */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Time</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Action</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">User</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resource</th>
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
                <td className="px-4 py-2.5 text-slate-600">{e.userId.substring(0, 8)}...</td>
                <td className="px-4 py-2.5 text-slate-500">{e.resourceType}/{e.resourceId.substring(0, 8)}</td>
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
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-slate-400">Page {page} of {Math.ceil(total / pageSize) || 1}</span>
        <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
