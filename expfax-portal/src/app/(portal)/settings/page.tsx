"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Save, User, Bell, Palette, Phone, Mail, AtSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatPhone } from "@/lib/phone";

type AccountLink = { accountGuid: string; faxNumber: string | null; label: string | null };
type NumberTab = { number: string; accountGuid: string; accountLabel: string | null };
type ForwardState = {
  loaded: boolean;
  emails: string[];
  newEmail: string;
  forwardReceived: boolean;
  format: string;
  notifyOnSend: boolean;
  notifyOnFail: boolean;
  saving: boolean;
  error: string | null;
  success: boolean;
};
type AliasState = {
  loaded: boolean;
  aliases: string[];
  newAlias: string;
  busy: boolean;
  error: string | null;
};

const defaultForward = (): ForwardState => ({
  loaded: false,
  emails: [],
  newEmail: "",
  forwardReceived: false,
  format: "pdf",
  notifyOnSend: false,
  notifyOnFail: false,
  saving: false,
  error: null,
  success: false,
});
const defaultAlias = (): AliasState => ({
  loaded: false,
  aliases: [],
  newAlias: "",
  busy: false,
  error: null,
});

function accountNumbers(acct: AccountLink): string[] {
  if (!acct.faxNumber) return [];
  return acct.faxNumber.split(",").map((s) => s.trim()).filter(Boolean);
}
function buildTabs(accts: AccountLink[]): NumberTab[] {
  const out: NumberTab[] = [];
  for (const a of accts) {
    const nums = accountNumbers(a);
    for (const n of nums) out.push({ number: n, accountGuid: a.accountGuid, accountLabel: a.label });
  }
  return out;
}
function numbersForAccount(tabs: NumberTab[], accountGuid: string): string[] {
  return tabs.filter((t) => t.accountGuid === accountGuid).map((t) => t.number);
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Profile (read-only)
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [faxNumber, setFaxNumber] = useState("");

  // Accounts + flattened per-number tabs
  const [accounts, setAccounts] = useState<AccountLink[]>([]);
  const [tabs, setTabs] = useState<NumberTab[]>([]);
  const [activeNumber, setActiveNumber] = useState<string | null>(null);

  // Global prefs
  const [numberProfiles, setNumberProfiles] = useState<Record<string, { senderName: string; senderCompany: string }>>({});
  const [globalNotifyOnReceive, setGlobalNotifyOnReceive] = useState(true);
  const [globalNotifyOnSendComplete, setGlobalNotifyOnSendComplete] = useState(false);
  // Per-number notification overrides — falls back to global when undefined
  const [notificationsByNumber, setNotificationsByNumber] = useState<
    Record<string, { notifyOnReceive: boolean; notifyOnSendComplete: boolean }>
  >({});
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [timezone, setTimezone] = useState("America/New_York");

  // Per-account FaxBack state (lazy-loaded on tab switch)
  const [forwardByAccount, setForwardByAccount] = useState<Record<string, ForwardState>>({});
  const [aliasesByAccount, setAliasesByAccount] = useState<Record<string, AliasState>>({});
  const [faxEmailDomain, setFaxEmailDomain] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setDisplayName(data.displayName);
        setEmail(data.email);
        setFaxNumber(data.faxNumber || "");
        const list: AccountLink[] = Array.isArray(data.faxbackAccounts) ? data.faxbackAccounts : [];
        setAccounts(list);
        const flat = buildTabs(list);
        setTabs(flat);
        // Pick the first number under the default account, else the very first tab.
        const defaultGuid: string | null = data.defaultAccountGuid ?? null;
        const firstUnderDefault = defaultGuid ? flat.find((t) => t.accountGuid === defaultGuid) : undefined;
        setActiveNumber(firstUnderDefault?.number ?? flat[0]?.number ?? null);
        const p = data.preferences || {};
        setGlobalNotifyOnReceive(p.notifyOnReceive ?? true);
        setGlobalNotifyOnSendComplete(p.notifyOnSendComplete ?? false);
        setItemsPerPage(p.itemsPerPage ?? 20);
        setTimezone(p.timezone ?? "America/New_York");
        setNumberProfiles(p.numberProfiles || {});
        setNotificationsByNumber(p.notificationsByNumber || {});
      })
      .finally(() => setLoading(false));
  }, []);

  // ---------- Per-account FaxBack data loaders ----------

  const loadForward = useCallback(async (guid: string) => {
    setForwardByAccount((prev) => ({ ...prev, [guid]: { ...(prev[guid] ?? defaultForward()), loaded: false, error: null } }));
    try {
      const r = await fetch(`/api/settings/fax-forward?accountGuid=${encodeURIComponent(guid)}`);
      const data = await r.json();
      if (r.ok) {
        const rawEmail: string = data.email ?? "";
        const emails = Array.from(
          new Set(
            rawEmail
              .split(/[,;]/)
              .map((s: string) => s.trim().toLowerCase())
              .filter(Boolean)
          )
        );
        setForwardByAccount((prev) => ({
          ...prev,
          [guid]: {
            ...defaultForward(),
            loaded: true,
            emails,
            forwardReceived: !!data.forwardReceived,
            format: data.format ?? "pdf",
            notifyOnSend: !!data.notifyOnSend,
            notifyOnFail: !!data.notifyOnFail,
          },
        }));
      } else {
        setForwardByAccount((prev) => ({
          ...prev,
          [guid]: { ...defaultForward(), loaded: true, error: data.error ?? "Failed to load" },
        }));
      }
    } catch (e) {
      setForwardByAccount((prev) => ({
        ...prev,
        [guid]: { ...defaultForward(), loaded: true, error: e instanceof Error ? e.message : "Failed to load" },
      }));
    }
  }, []);

  const loadAliases = useCallback(async (guid: string) => {
    setAliasesByAccount((prev) => ({ ...prev, [guid]: { ...(prev[guid] ?? defaultAlias()), loaded: false, error: null } }));
    try {
      const r = await fetch(`/api/settings/email-aliases?accountGuid=${encodeURIComponent(guid)}`);
      const data = await r.json();
      if (r.ok) {
        if (data.faxEmailDomain) setFaxEmailDomain(data.faxEmailDomain);
        setAliasesByAccount((prev) => ({
          ...prev,
          [guid]: { ...defaultAlias(), loaded: true, aliases: Array.isArray(data.aliases) ? data.aliases : [] },
        }));
      } else {
        setAliasesByAccount((prev) => ({
          ...prev,
          [guid]: { ...defaultAlias(), loaded: true, error: data.error ?? "Failed to load" },
        }));
      }
    } catch (e) {
      setAliasesByAccount((prev) => ({
        ...prev,
        [guid]: { ...defaultAlias(), loaded: true, error: e instanceof Error ? e.message : "Failed to load" },
      }));
    }
  }, []);

  // When active tab changes, load this number's account data if not yet loaded.
  const activeTab = activeNumber ? tabs.find((t) => t.number === activeNumber) ?? null : null;
  const activeGuid = activeTab?.accountGuid ?? null;
  useEffect(() => {
    if (!activeGuid) return;
    if (!forwardByAccount[activeGuid]?.loaded) loadForward(activeGuid);
    if (!aliasesByAccount[activeGuid]?.loaded) loadAliases(activeGuid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGuid]);

  // ---------- Forward (per account) handlers ----------

  function updateForward(guid: string, patch: Partial<ForwardState>) {
    setForwardByAccount((prev) => ({ ...prev, [guid]: { ...(prev[guid] ?? defaultForward()), ...patch } }));
  }

  async function handleForwardSave(guid: string) {
    const cur = forwardByAccount[guid];
    if (!cur) return;
    const anyOn = cur.forwardReceived || cur.notifyOnSend || cur.notifyOnFail;
    if (anyOn && cur.emails.length === 0) {
      updateForward(guid, { error: "Add at least one email address when any option is enabled" });
      return;
    }
    updateForward(guid, { saving: true, error: null, success: false });
    try {
      const res = await fetch("/api/settings/fax-forward", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountGuid: guid,
          email: cur.emails.join(","),
          forwardReceived: cur.forwardReceived,
          format: cur.format,
          notifyOnSend: cur.notifyOnSend,
          notifyOnFail: cur.notifyOnFail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateForward(guid, { saving: false, error: data.error ?? "Failed to save" });
        toast.error(data.error ?? "Failed to save");
      } else {
        updateForward(guid, { saving: false, success: true });
        toast.success("Email settings saved");
        setTimeout(() => updateForward(guid, { success: false }), 3000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      updateForward(guid, { saving: false, error: msg });
      toast.error(msg);
    }
  }

  function handleAddForwardEmail(guid: string) {
    const cur = forwardByAccount[guid];
    if (!cur) return;
    const v = (cur.newEmail ?? "").trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      updateForward(guid, { error: "Invalid email address" });
      return;
    }
    if (cur.emails.includes(v)) {
      updateForward(guid, { newEmail: "" });
      return;
    }
    updateForward(guid, { emails: [...cur.emails, v], newEmail: "", error: null });
  }

  function handleRemoveForwardEmail(guid: string, email: string) {
    const cur = forwardByAccount[guid];
    if (!cur) return;
    updateForward(guid, { emails: cur.emails.filter((e) => e !== email), error: null });
  }

  // ---------- Aliases (per account) handlers ----------

  function updateAlias(guid: string, patch: Partial<AliasState>) {
    setAliasesByAccount((prev) => ({ ...prev, [guid]: { ...(prev[guid] ?? defaultAlias()), ...patch } }));
  }

  async function handleAddAlias(guid: string) {
    const cur = aliasesByAccount[guid];
    if (!cur) return;
    const v = cur.newAlias.trim().toLowerCase();
    if (!v) return;
    updateAlias(guid, { busy: true, error: null });
    try {
      const r = await fetch("/api/settings/email-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountGuid: guid, email: v }),
      });
      const data = await r.json();
      if (!r.ok) {
        const msg = data.error ?? "Failed to add";
        updateAlias(guid, { busy: false, error: msg });
        toast.error(msg);
      } else {
        updateAlias(guid, { busy: false, newAlias: "", error: null });
        toast.success(`Added ${v}`);
        await loadAliases(guid);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add";
      updateAlias(guid, { busy: false, error: msg });
      toast.error(msg);
    }
  }

  async function handleRemoveAlias(guid: string, aliasEmail: string) {
    updateAlias(guid, { busy: true, error: null });
    try {
      const r = await fetch(
        `/api/settings/email-aliases?accountGuid=${encodeURIComponent(guid)}&email=${encodeURIComponent(aliasEmail)}`,
        { method: "DELETE" }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = data.error ?? "Failed to remove";
        updateAlias(guid, { busy: false, error: msg });
        toast.error(msg);
      } else {
        updateAlias(guid, { busy: false, error: null });
        toast.success(`Removed ${aliasEmail}`);
        await loadAliases(guid);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to remove";
      updateAlias(guid, { busy: false, error: msg });
      toast.error(msg);
    }
  }

  // ---------- Global save (cover profiles + per-account notifications + display) ----------

  function updateNumberProfile(num: string, field: "senderName" | "senderCompany", value: string) {
    setNumberProfiles((prev) => ({
      ...prev,
      [num]: { senderName: "", senderCompany: "", ...prev[num], [field]: value },
    }));
  }

  function getNotif(num: string): { notifyOnReceive: boolean; notifyOnSendComplete: boolean } {
    return notificationsByNumber[num] ?? {
      notifyOnReceive: globalNotifyOnReceive,
      notifyOnSendComplete: globalNotifyOnSendComplete,
    };
  }
  function setNotif(num: string, patch: Partial<{ notifyOnReceive: boolean; notifyOnSendComplete: boolean }>) {
    setNotificationsByNumber((prev) => {
      const cur = prev[num] ?? {
        notifyOnReceive: globalNotifyOnReceive,
        notifyOnSendComplete: globalNotifyOnSendComplete,
      };
      return { ...prev, [num]: { ...cur, ...patch } };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSuccess(false);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notifyOnReceive: globalNotifyOnReceive,
        notifyOnSendComplete: globalNotifyOnSendComplete,
        itemsPerPage,
        timezone,
        numberProfiles,
        notificationsByNumber,
      }),
    });
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  }

  if (loading) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  const fwd = activeGuid ? forwardByAccount[activeGuid] : undefined;
  const aliasSt = activeGuid ? aliasesByAccount[activeGuid] : undefined;
  const notif = activeNumber
    ? getNotif(activeNumber)
    : { notifyOnReceive: globalNotifyOnReceive, notifyOnSendComplete: globalNotifyOnSendComplete };
  // Other numbers that share the active number's FaxBack account (email settings + aliases are account-wide).
  const siblings = activeGuid ? numbersForAccount(tabs, activeGuid).filter((n) => n !== activeNumber) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg p-3">Settings saved!</div>}

      {/* Profile (read-only) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-sm">Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Display Name</Label>
              <Input value={displayName} disabled className="bg-slate-50" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Email</Label>
              <Input value={email} disabled className="bg-slate-50" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Fax Number</Label>
            <Input value={faxNumber.split(",").map((n) => formatPhone(n.trim())).filter(Boolean).join(", ")} disabled className="bg-slate-50" />
          </div>
          <p className="text-xs text-slate-400">Profile information is managed by your administrator.</p>
        </CardContent>
      </Card>

      {/* Per-fax-number sub-tabs */}
      {tabs.length === 0 ? (
        <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-4">
          No fax numbers are linked to your account yet. Contact your administrator.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {tabs.map((t) => {
              const active = t.number === activeNumber;
              return (
                <button
                  key={t.number}
                  type="button"
                  onClick={() => setActiveNumber(t.number)}
                  className={
                    "px-3 py-2 text-sm border-b-2 -mb-px transition-colors " +
                    (active
                      ? "border-blue-600 text-blue-700 font-medium"
                      : "border-transparent text-slate-500 hover:text-slate-700")
                  }
                  title={t.accountLabel ?? undefined}
                >
                  {formatPhone(t.number)}
                </button>
              );
            })}
          </div>

          {activeNumber && (
            <div className="space-y-6">
              {/* Cover Page Defaults — for this single fax number */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-emerald-600" />
                    <CardTitle className="text-sm">Cover Page Defaults</CardTitle>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Your name and company for {formatPhone(activeNumber)}. These auto-fill the cover page when you send a fax from this number.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Your Name</Label>
                      <Input
                        placeholder="e.g. John Smith"
                        value={numberProfiles[activeNumber]?.senderName ?? ""}
                        onChange={(e) => updateNumberProfile(activeNumber, "senderName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-400">Company</Label>
                      <Input
                        placeholder="e.g. Acme Corp"
                        value={numberProfiles[activeNumber]?.senderCompany ?? ""}
                        onChange={(e) => updateNumberProfile(activeNumber, "senderCompany", e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {siblings.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Email Notifications and Send-by-Email aliases below are shared with{" "}
                  {siblings.map(formatPhone).join(", ")} (same FaxBack account).
                </div>
              )}

              {/* Email Notifications (FaxBack QueueProfileXml) */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <CardTitle className="text-sm">Email Notifications</CardTitle>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter one or more email addresses, then choose which events should be delivered to them.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!fwd?.loaded ? (
                    <p className="text-xs text-slate-400">Loading...</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs text-slate-400">Email recipient(s)</Label>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="inbox@company.com"
                            value={fwd.newEmail ?? ""}
                            onChange={(e) => updateForward(activeGuid!, { newEmail: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddForwardEmail(activeGuid!);
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddForwardEmail(activeGuid!)}
                            disabled={!(fwd.newEmail ?? "").trim()}
                          >
                            Add
                          </Button>
                        </div>
                        {fwd.emails.length === 0 ? (
                          <p className="text-xs text-slate-400">No recipients yet.</p>
                        ) : (
                          <ul className="border border-slate-200 rounded-md divide-y divide-slate-100">
                            {fwd.emails.map((e) => (
                              <li key={e} className="flex items-center justify-between px-3 py-2 text-sm">
                                <span className="text-slate-700">{e}</span>
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-red-600"
                                  title="Remove"
                                  onClick={() => handleRemoveForwardEmail(activeGuid!, e)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Forward received faxes</p>
                          <p className="text-xs text-slate-400">Send each incoming fax as an email attachment</p>
                        </div>
                        <Switch
                          checked={fwd.forwardReceived}
                          onCheckedChange={(v) => updateForward(activeGuid!, { forwardReceived: v })}
                        />
                      </div>
                      {fwd.forwardReceived && (
                        <div className="space-y-1">
                          <Label className="text-xs text-slate-400">Attachment Format</Label>
                          <select
                            value={fwd.format}
                            onChange={(e) => updateForward(activeGuid!, { format: e.target.value })}
                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
                          >
                            <option value="pdf">PDF</option>
                            <option value="tiff">TIFF</option>
                          </select>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Delivery notification</p>
                          <p className="text-xs text-slate-400">Send an email when an outbound fax completes successfully</p>
                        </div>
                        <Switch
                          checked={fwd.notifyOnSend}
                          onCheckedChange={(v) => updateForward(activeGuid!, { notifyOnSend: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm">Non-delivery notification</p>
                          <p className="text-xs text-slate-400">Send an email when an outbound fax fails</p>
                        </div>
                        <Switch
                          checked={fwd.notifyOnFail}
                          onCheckedChange={(v) => updateForward(activeGuid!, { notifyOnFail: v })}
                        />
                      </div>
                      {fwd.error && <p className="text-xs text-red-500">{fwd.error}</p>}
                      {fwd.success && <p className="text-xs text-emerald-600">Saved!</p>}
                      <Button size="sm" onClick={() => handleForwardSave(activeGuid!)} disabled={fwd.saving}>
                        {fwd.saving ? "Saving..." : "Save Email Settings"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Send Faxes by Email (FaxBack email aliases) */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <AtSign className="h-4 w-4 text-violet-600" />
                    <CardTitle className="text-sm">Send Faxes by Email</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-slate-600 space-y-1.5">
                    <p>
                      Register email addresses that you can send <em>from</em>. To send a fax from this number, email{" "}
                      <code className="px-1 py-0.5 bg-slate-100 rounded text-[11px]">
                        {`<faxnumber>@${faxEmailDomain ?? "expfax.com"}`}
                      </code>{" "}
                      from one of these addresses.
                    </p>
                    <ul className="list-disc list-inside text-slate-500 space-y-0.5 pl-1">
                      <li>The email <strong>Subject</strong> becomes the cover page subject.</li>
                      <li>The email <strong>Body</strong> becomes the cover page message.</li>
                      <li>Any <strong>attachments</strong> are appended as fax pages.</li>
                    </ul>
                  </div>

                  {!aliasSt?.loaded ? (
                    <p className="text-xs text-slate-400">Loading...</p>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="you@yourcompany.com"
                          value={aliasSt.newAlias}
                          onChange={(e) => updateAlias(activeGuid!, { newAlias: e.target.value })}
                          disabled={aliasSt.busy}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddAlias(activeGuid!);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleAddAlias(activeGuid!)}
                          disabled={aliasSt.busy || !aliasSt.newAlias.trim()}
                        >
                          Add
                        </Button>
                      </div>

                      {aliasSt.error && <p className="text-xs text-red-500">{aliasSt.error}</p>}

                      {aliasSt.aliases.length === 0 ? (
                        <p className="text-xs text-slate-400">No email senders registered yet.</p>
                      ) : (
                        <ul className="border border-slate-200 rounded-md divide-y divide-slate-100">
                          {aliasSt.aliases.map((a) => (
                            <li key={a} className="flex items-center justify-between px-3 py-2 text-sm">
                              <span className="text-slate-700">{a}</span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                                title="Remove"
                                disabled={aliasSt.busy}
                                onClick={() => handleRemoveAlias(activeGuid!, a)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Notifications (per account, in-app) */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-600" />
                    <CardTitle className="text-sm">In-App Notifications</CardTitle>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Controls toast / badge alerts shown in the portal for this fax number.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">New fax received</p>
                      <p className="text-xs text-slate-400">Get notified when a new fax arrives</p>
                    </div>
                    <Switch
                      checked={notif.notifyOnReceive}
                      onCheckedChange={(v) => setNotif(activeNumber!, { notifyOnReceive: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Send complete</p>
                      <p className="text-xs text-slate-400">Get notified when a fax is successfully sent</p>
                    </div>
                    <Switch
                      checked={notif.notifyOnSendComplete}
                      onCheckedChange={(v) => setNotif(activeNumber!, { notifyOnSendComplete: v })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Display */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-purple-600" />
            <CardTitle className="text-sm">Display</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Items per page</Label>
              <select
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(parseInt(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <select
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
