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
import { Mail, Link2, Shield, Users, ShieldCheck, KeyRound, Plus, Trash2, Star } from "lucide-react";

interface LinkedAccount {
  accountGuid: string;
  accountId: string;
  faxNumber: string | null;
  label: string | null;
}

interface UserRow {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "user";
  authType?: "microsoft" | "password";
  signupCompletedAt: string | null;
  faxbackAccountId: string | null;
  faxbackAccountGuid: string | null;
  faxbackAccounts?: LinkedAccount[];
  defaultFaxbackAccountGuid?: string | null;
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
  // Dialog for managing all accounts of a user
  const [manageDialog, setManageDialog] = useState<UserRow | null>(null);
  // Dialog for picking and adding a new account
  const [addDialog, setAddDialog] = useState<UserRow | null>(null);
  const [fbAccounts, setFbAccounts] = useState<FaxBackAccount[]>([]);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [linkGuid, setLinkGuid] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedAcc, setSelectedAcc] = useState<FaxBackAccount | null>(null);
  const [saving, setSaving] = useState(false);
  // Keep a local copy of accounts being managed so we can reflect immediate changes
  const [managedAccounts, setManagedAccounts] = useState<LinkedAccount[]>([]);
  const [managedDefault, setManagedDefault] = useState<string | null>(null);

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

  function openManageDialog(u: UserRow) {
    setManageDialog(u);
    setManagedAccounts(u.faxbackAccounts ?? (
      u.faxbackAccountGuid
        ? [{ accountGuid: u.faxbackAccountGuid, accountId: u.faxbackAccountId ?? "", faxNumber: u.faxNumber ?? null, label: null }]
        : []
    ));
    setManagedDefault(u.defaultFaxbackAccountGuid ?? u.faxbackAccountGuid ?? null);
  }

  function openAddDialog(u: UserRow) {
    setAddDialog(u);
    setLinkGuid("");
    setLinkSearch("");
    setSelectedAcc(null);
    setFbAccounts([]);
    setFbError(null);
    setFbLoading(false);
    void loadAccounts("");
  }

  async function handleAddAccount() {
    if (!addDialog) return;
    if (!selectedAcc) {
      alert("Pick a FaxBack account first.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/users/${addDialog.id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addAccount: {
          accountGuid: selectedAcc.accountGuid,
          accountId: selectedAcc.accountId,
          faxNumber: selectedAcc.faxNumber ?? null,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Add account failed");
      return;
    }
    setAddDialog(null);
    // Re-open manage dialog with updated data
    const updated: UserRow = {
      ...addDialog,
      faxbackAccounts: [
        ...(managedAccounts),
        { accountGuid: selectedAcc.accountGuid, accountId: selectedAcc.accountId, faxNumber: selectedAcc.faxNumber ?? null, label: null },
      ],
    };
    load();
    setManageDialog(updated);
    setManagedAccounts(updated.faxbackAccounts ?? []);
  }

  async function handleRemoveAccount(u: UserRow, accountGuid: string) {
    if (!confirm("Remove this account from the user?")) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${u.id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ removeAccount: { accountGuid } }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Remove failed");
      return;
    }
    const next = managedAccounts.filter((a) => a.accountGuid !== accountGuid);
    setManagedAccounts(next);
    if (managedDefault === accountGuid) {
      setManagedDefault(next[0]?.accountGuid ?? null);
    }
    load();
  }

  async function handleSetDefault(u: UserRow, accountGuid: string) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${u.id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setDefaultAccount: { accountGuid } }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Set default failed");
      return;
    }
    setManagedDefault(accountGuid);
    load();
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
                    {(() => {
                      const accounts = u.faxbackAccounts ?? (
                        u.faxbackAccountGuid
                          ? [{ accountGuid: u.faxbackAccountGuid, accountId: u.faxbackAccountId ?? "", faxNumber: u.faxNumber ?? null, label: null }]
                          : []
                      );
                      const defaultGuid = u.defaultFaxbackAccountGuid ?? u.faxbackAccountGuid;
                      if (accounts.length === 0) {
                        return <Badge variant="outline" className="text-amber-600 text-[10px]">Not linked</Badge>;
                      }
                      return (
                        <div className="space-y-0.5">
                          {accounts.map((a) => (
                            <div key={a.accountGuid} className="flex items-center gap-1">
                              {defaultGuid === a.accountGuid && (
                                <Star className="h-3 w-3 text-amber-400 shrink-0" />
                              )}
                              <span className="text-sm font-mono">{a.accountId || a.accountGuid.slice(0, 8)}</span>
                              {a.faxNumber && <span className="text-xs text-slate-400">{a.faxNumber}</span>}
                            </div>
                          ))}
                          {accounts.length > 1 && (
                            <p className="text-[10px] text-slate-400">{accounts.length} accounts</p>
                          )}
                        </div>
                      );
                    })()}
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
                        title={canLink ? "Manage FaxBack accounts" : "User hasn't signed up yet"}
                        onClick={() => openManageDialog(u)}
                      >
                        <Link2 className="h-4 w-4 mr-1" /> Accounts
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

      {/* Manage Accounts Dialog */}
      <Dialog open={!!manageDialog} onOpenChange={() => setManageDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>FaxBack Accounts — {manageDialog?.displayName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {managedAccounts.length === 0 ? (
              <p className="text-sm text-slate-400">No accounts linked yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white overflow-hidden">
                {managedAccounts.map((a) => {
                  const isDefault = managedDefault === a.accountGuid;
                  return (
                    <div key={a.accountGuid} className={`flex items-center justify-between px-3 py-2 ${isDefault ? "bg-amber-50" : ""}`}>
                      <div>
                        <div className="flex items-center gap-1">
                          {isDefault && <Star className="h-3 w-3 text-amber-400" />}
                          <span className="text-sm font-mono font-medium">{a.accountId || a.accountGuid.slice(0, 12)}</span>
                        </div>
                        {a.faxNumber && <p className="text-xs text-slate-500">{a.faxNumber}</p>}
                        {isDefault && <p className="text-[10px] text-amber-600">Default</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            title="Set as default"
                            onClick={() => handleSetDefault(manageDialog!, a.accountGuid)}
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveAccount(manageDialog!, a.accountGuid)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageDialog(null)}>Close</Button>
            <Button
              onClick={() => {
                const u = manageDialog!;
                setManageDialog(null);
                openAddDialog(u);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={!!addDialog} onOpenChange={() => setAddDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add FaxBack Account — {addDialog?.displayName}</DialogTitle>
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
                <div className="text-emerald-700 font-mono text-xs">{selectedAcc.accountGuid}</div>
                {selectedAcc.faxNumber && (
                  <div className="text-emerald-700">Fax: {selectedAcc.faxNumber}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(null)}>Cancel</Button>
            <Button onClick={handleAddAccount} disabled={saving || !selectedAcc}>
              {saving ? "Saving..." : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
