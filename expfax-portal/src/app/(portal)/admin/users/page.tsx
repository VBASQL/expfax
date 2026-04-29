"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Mail, Link2, Shield, Users, ShieldCheck, KeyRound } from "lucide-react";

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "user";
  authType?: "microsoft" | "password";
  signupCompletedAt: string | null;
  faxbackAccountId: string | null;
  faxbackAccountGuid: string | null;
  faxNumber: string | null;
  mfaMode?: "off" | "always" | "new_location";
  lastLogin: string | null;
}

interface FaxBackAccount {
  accountGuid: string;
  accountId: string;
  displayName: string | null;
  faxNumber: string | null;
  emailAlias: string | null;
}

type Filter = "unlinked" | "linked" | "all";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState<Filter>("unlinked");
  const [linkDialog, setLinkDialog] = useState<UserRow | null>(null);
  const [fbAccounts, setFbAccounts] = useState<FaxBackAccount[]>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [linkGuid, setLinkGuid] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedAcc, setSelectedAcc] = useState<FaxBackAccount | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.items || []));
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return users;
    if (filter === "linked") return users.filter((u) => !!u.faxbackAccountId);
    return users.filter((u) => !u.faxbackAccountId);
  }, [users, filter]);

  async function handleLink() {
    if (!linkDialog) return;
    if (!selectedAcc) {
      alert("Pick a FaxBack account first.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/users/${linkDialog.id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faxbackAccountId: selectedAcc.accountId || null,
        faxbackAccountGuid: selectedAcc.accountGuid || null,
        faxNumber: selectedAcc.faxNumber || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Link failed");
      return;
    }
    setLinkDialog(null);
    load();
  }

  function openLinkDialog(u: UserRow) {
    setLinkDialog(u);
    setLinkGuid(u.faxbackAccountGuid || "");
    setLinkSearch("");
    setSelectedAcc(null);
    setFbAccounts([]);
    setFbError(null);
    setFbLoading(false);
    // Auto-load the full list when opening.
    void loadAccounts("");
  }

  async function loadAccounts(search: string) {
    setFbError(null);
    setFbLoading(true);
    try {
      const url = search
        ? `/api/admin/faxback/accounts?search=${encodeURIComponent(search)}`
        : `/api/admin/faxback/accounts`;
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFbError(data.error || `HTTP ${r.status}`);
        setFbAccounts([]);
        return;
      }
      setFbAccounts(data.items || []);
    } catch (e) {
      setFbError(e instanceof Error ? e.message : "Load failed");
      setFbAccounts([]);
    } finally {
      setFbLoading(false);
    }
  }

  async function verifyGuid(guid: string): Promise<FaxBackAccount | null> {
    setFbError(null);
    if (!guid) return null;
    setFbLoading(true);
    try {
      const r = await fetch(
        `/api/admin/faxback/accounts?guid=${encodeURIComponent(guid)}`
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.items?.length) {
        setFbError(data.error || `HTTP ${r.status}`);
        return null;
      }
      const acc = data.items[0] as FaxBackAccount;
      setSelectedAcc(acc);
      setFbAccounts([acc]);
      return acc;
    } catch (e) {
      setFbError(e instanceof Error ? e.message : "Verify failed");
      return null;
    } finally {
      setFbLoading(false);
    }
  }

  async function handleRoleToggle(userId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`Change role to ${newRole}?`)) return;
    await fetch(`/api/admin/users/${userId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function handleMfaChange(userId: string, mfaMode: string) {
    const res = await fetch(`/api/admin/users/${userId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaMode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Update failed");
    }
    load();
  }

  const counts = useMemo(
    () => ({
      all: users.length,
      unlinked: users.filter((u) => !u.faxbackAccountId).length,
      linked: users.filter((u) => !!u.faxbackAccountId).length,
    }),
    [users]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold">User Management</h2>
        </div>
        <div className="flex items-center gap-1 text-sm">
          {(["unlinked", "linked", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md ${
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
              <span className="opacity-60 text-xs">({counts[f]})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">User</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sign-in</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">FaxBack Account</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">MFA</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Role</th>
              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Login</th>
              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((u) => {
              const authType = u.authType ?? "microsoft";
              const canLink = !!u.signupCompletedAt;
              return (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium">{u.displayName}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    {authType === "microsoft" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                        <ShieldCheck className="h-3 w-3" /> Microsoft
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <KeyRound className="h-3 w-3" /> Password
                      </span>
                    )}
                    {!u.signupCompletedAt && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Awaiting signup</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {u.faxbackAccountId ? (
                      <div>
                        <p className="text-sm font-mono">{u.faxbackAccountId}</p>
                        {u.faxNumber && <p className="text-xs text-slate-400">{u.faxNumber}</p>}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 text-[10px]">Not linked</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {authType === "microsoft" ? (
                      <select
                        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
                        value={u.mfaMode ?? "off"}
                        onChange={(e) => handleMfaChange(u.id, e.target.value)}
                      >
                        <option value="off">Off</option>
                        <option value="always">Always</option>
                        <option value="new_location">New location</option>
                      </select>
                    ) : (
                      <span className="text-xs text-slate-400">N/A</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      variant={u.role === "admin" ? "default" : "secondary"}
                      className="text-[10px] cursor-pointer"
                      onClick={() => handleRoleToggle(u.id, u.role)}
                    >
                      <Shield className="h-3 w-3 mr-1" /> {u.role}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-400">
                    {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canLink}
                        title={canLink ? "Link FaxBack account" : "User hasn't signed up yet"}
                        onClick={() => openLinkDialog(u)}
                      >
                        <Link2 className="h-4 w-4 mr-1" /> Link
                      </Button>
                      {u.faxbackAccountId && (
                        <Link href={`/admin/users/${u.id}/email`}>
                          <Button variant="ghost" size="sm">
                            <Mail className="h-4 w-4 mr-1" /> Email
                          </Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  No users in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Link Dialog */}
      <Dialog open={!!linkDialog} onOpenChange={() => setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link FaxBack Account — {linkDialog?.displayName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="fb-search">Search FaxBack accounts</Label>
              <input
                id="fb-search"
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
                placeholder="Filter by AccountId, name, fax number, or GUID…"
                value={linkSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setLinkSearch(v);
                  void loadAccounts(v);
                }}
              />
              <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white">
                {fbLoading && (
                  <div className="px-3 py-3 text-sm text-slate-500">Loading…</div>
                )}
                {!fbLoading && fbAccounts.length === 0 && !fbError && (
                  <div className="px-3 py-3 text-sm text-slate-400">
                    No accounts match that search.
                  </div>
                )}
                {!fbLoading &&
                  fbAccounts.map((a) => {
                    const sel = selectedAcc?.accountGuid === a.accountGuid;
                    return (
                      <button
                        key={a.accountGuid}
                        type="button"
                        onClick={() => setSelectedAcc(a)}
                        className={`block w-full text-left px-3 py-2 text-sm border-b border-slate-100 last:border-0 ${
                          sel ? "bg-emerald-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-medium text-slate-800">
                          {a.accountId || "(no AccountId)"}
                          {a.displayName ? ` — ${a.displayName}` : ""}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {a.accountGuid}
                          {a.faxNumber ? ` · Fax: ${a.faxNumber}` : ""}
                          {a.emailAlias ? ` · ${a.emailAlias}` : ""}
                        </div>
                      </button>
                    );
                  })}
              </div>
              {fbError && <p className="text-sm text-red-600">{fbError}</p>}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                Or paste an AccountGuid directly
              </summary>
              <div className="mt-2 flex gap-2">
                <input
                  id="fb-guid"
                  className="flex-1 text-sm font-mono border border-slate-200 rounded-md px-3 py-2 bg-white"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={linkGuid}
                  onChange={(e) => setLinkGuid(e.target.value.trim())}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => verifyGuid(linkGuid)}
                  disabled={fbLoading || !linkGuid}
                >
                  {fbLoading ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </details>

            {selectedAcc && (
              <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                <div className="font-medium text-emerald-800">
                  Selected: {selectedAcc.accountId || "(no AccountId)"}
                  {selectedAcc.displayName ? ` — ${selectedAcc.displayName}` : ""}
                </div>
                <div className="text-emerald-700 font-mono text-xs">
                  {selectedAcc.accountGuid}
                </div>
                {selectedAcc.faxNumber && (
                  <div className="text-emerald-700">Fax: {selectedAcc.faxNumber}</div>
                )}
                {selectedAcc.emailAlias && (
                  <div className="text-emerald-700">
                    Email alias: {selectedAcc.emailAlias}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={saving || !selectedAcc}
            >
              {saving ? "Saving..." : "Link Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
