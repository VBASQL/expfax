"use client";

import { useState, useEffect, useCallback, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AtSign, Trash2 } from "lucide-react";
import { formatPhone } from "@/lib/phone";

interface Account {
  accountGuid: string;
  accountId: string;
  faxNumber: string | null;
  label: string | null;
}

interface EmailSettings {
  inboundEnabled?: boolean;
  emailAlias?: string;
  includeCoverPage?: boolean;
  forwardReceived?: boolean;
  format?: string;
  notifyOnSend?: boolean;
  notifyOnFail?: boolean;
}

function splitEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw.split(/[,;]/).map((s) => s.trim().toLowerCase()).filter(Boolean),
    ),
  );
}

function formatFaxNumberField(raw: string | null): string | null {
  if (!raw) return null;
  // Split on common separators first
  const parts = raw.split(/[,;\s/|]+/).map((s) => s.trim()).filter(Boolean);
  // If single token of all digits with length a multiple of 10, split into 10-digit chunks
  const expanded: string[] = [];
  for (const p of parts) {
    const digits = p.replace(/\D+/g, "");
    if (digits.length > 10 && digits.length % 10 === 0 && !digits.startsWith("1")) {
      for (let i = 0; i < digits.length; i += 10) expanded.push(digits.slice(i, i + 10));
    } else {
      expanded.push(p);
    }
  }
  const formatted = expanded.map((p) => formatPhone(p)).filter(Boolean);
  return formatted.length ? formatted.join(", ") : null;
}

function accountLabel(a: Account): string {
  const num = formatFaxNumberField(a.faxNumber);
  if (a.label && num) return `${a.label} — ${num}`;
  return num ?? a.label ?? a.accountId ?? a.accountGuid.slice(0, 8);
}

export default function AdminEmailConfigPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountGuid, setAccountGuid] = useState<string | null>(null);
  const [settings, setSettings] = useState<EmailSettings>({});
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Send-by-email aliases (per account)
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [aliasBusy, setAliasBusy] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState("");
  const [faxEmailDomain, setFaxEmailDomain] = useState<string | null>(null);

  const load = useCallback(async (guid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = guid
        ? `/api/admin/users/${userId}/email?accountGuid=${encodeURIComponent(guid)}`
        : `/api/admin/users/${userId}/email`;
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error ?? "Failed to load email settings");
        if (Array.isArray(data?.accounts)) setAccounts(data.accounts);
        return;
      }
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setAccountGuid(data.accountGuid ?? null);
      setSettings({
        inboundEnabled: !!data.inboundEnabled,
        emailAlias: data.emailAlias ?? "",
        includeCoverPage: !!data.includeCoverPage,
        forwardReceived: !!data.forwardReceived,
        format: data.format ?? "pdf",
        notifyOnSend: !!data.notifyOnSend,
        notifyOnFail: !!data.notifyOnFail,
      });
      setEmails(splitEmails(data.deliveryEmail ?? ""));
      setNewEmail("");
      setEmailError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load email settings");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const loadAliases = useCallback(async (guid: string) => {
    setAliasesLoaded(false);
    setAliasError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}/email-aliases?accountGuid=${encodeURIComponent(guid)}`);
      const data = await r.json();
      if (!r.ok) {
        setAliasError(data?.error ?? "Failed to load");
        setAliases([]);
      } else {
        setAliases(Array.isArray(data.aliases) ? data.aliases : []);
        setFaxEmailDomain(data.faxEmailDomain ?? null);
      }
    } catch (e) {
      setAliasError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setAliasesLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (accountGuid) loadAliases(accountGuid);
  }, [accountGuid, loadAliases]);

  async function handleAddAlias() {
    if (!accountGuid) return;
    const v = newAlias.trim().toLowerCase();
    if (!v) return;
    setAliasBusy(true);
    setAliasError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}/email-aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountGuid, email: v }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAliasError(data?.error ?? "Failed to add");
      } else {
        setNewAlias("");
        await loadAliases(accountGuid);
      }
    } catch (e) {
      setAliasError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAliasBusy(false);
    }
  }

  async function handleRemoveAlias(aliasEmail: string) {
    if (!accountGuid) return;
    setAliasBusy(true);
    setAliasError(null);
    try {
      const r = await fetch(
        `/api/admin/users/${userId}/email-aliases?accountGuid=${encodeURIComponent(accountGuid)}&email=${encodeURIComponent(aliasEmail)}`,
        { method: "DELETE" },
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setAliasError(data?.error ?? "Failed to remove");
      } else {
        await loadAliases(accountGuid);
      }
    } catch (e) {
      setAliasError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setAliasBusy(false);
    }
  }

  function handleAddEmail() {
    const v = newEmail.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setEmailError("Invalid email address");
      return;
    }
    if (emails.includes(v)) {
      setNewEmail("");
      return;
    }
    setEmails((prev) => [...prev, v]);
    setNewEmail("");
    setEmailError(null);
  }

  function handleRemoveEmail(e: string) {
    setEmails((prev) => prev.filter((x) => x !== e));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    const anyOutboundOn =
      !!settings.forwardReceived || !!settings.notifyOnSend || !!settings.notifyOnFail;
    if (anyOutboundOn && emails.length === 0) {
      setSaveError("Add at least one email address when any forwarding/notification option is enabled");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${userId}/email`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountGuid,
          ...settings,
          deliveryEmail: emails.join(","),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to save");
      } else {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400 p-6">Loading...</p>;
  if (error) return <p className="text-sm text-red-500 p-6">Error: {error}</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Email Configuration</h2>

      {accounts.length > 1 && (
        <Card>
          <CardContent className="p-5 space-y-2">
            <Label>FaxBack account / number</Label>
            <select
              value={accountGuid ?? ""}
              onChange={(e) => load(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.accountGuid} value={a.accountGuid}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400">
              Email settings are scoped to the selected FaxBack account. Switching accounts discards unsaved changes — click Save Changes before switching.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-medium text-sm text-slate-700">Email Notifications</h3>
          <p className="text-xs text-slate-400">
            Enter one or more email addresses, then choose which events should be delivered to them.
          </p>

          <div className="space-y-2">
            <Label className="text-xs text-slate-500">Email recipient(s)</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="inbox@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
              />
              <Button size="sm" onClick={handleAddEmail} disabled={!newEmail.trim()}>
                Add
              </Button>
            </div>
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
            {emails.length === 0 ? (
              <p className="text-xs text-slate-400">No recipients yet.</p>
            ) : (
              <ul className="border border-slate-200 rounded-md divide-y divide-slate-100">
                {emails.map((e) => (
                  <li key={e} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-700">{e}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      title="Remove"
                      onClick={() => handleRemoveEmail(e)}
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
              <Label>Forward received faxes</Label>
              <p className="text-xs text-slate-400">Send each incoming fax as an email attachment</p>
            </div>
            <Switch
              checked={settings.forwardReceived ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, forwardReceived: v }))}
            />
          </div>
          {settings.forwardReceived && (
            <div className="space-y-2">
              <Label>Attachment Format</Label>
              <select
                value={settings.format ?? "pdf"}
                onChange={(e) => setSettings((s) => ({ ...s, format: e.target.value }))}
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="tiff">TIFF</option>
              </select>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <Label>Delivery notification</Label>
              <p className="text-xs text-slate-400">Send an email when an outbound fax completes successfully</p>
            </div>
            <Switch
              checked={settings.notifyOnSend ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, notifyOnSend: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Non-delivery notification</Label>
              <p className="text-xs text-slate-400">Send an email when an outbound fax fails</p>
            </div>
            <Switch
              checked={settings.notifyOnFail ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, notifyOnFail: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AtSign className="h-4 w-4 text-violet-600" />
            <h3 className="font-medium text-sm text-slate-700">Send Faxes by Email</h3>
          </div>
          <div className="text-xs text-slate-600 space-y-1.5">
            <p>
              Register email addresses this user can send <em>from</em>. To send a fax from this number, they email{" "}
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

          {!aliasesLoaded ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="user@yourcompany.com"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  disabled={aliasBusy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddAlias();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleAddAlias}
                  disabled={aliasBusy || !newAlias.trim()}
                >
                  Add
                </Button>
              </div>
              {aliasError && <p className="text-xs text-red-500">{aliasError}</p>}
              {aliases.length === 0 ? (
                <p className="text-xs text-slate-400">No email senders registered yet.</p>
              ) : (
                <ul className="border border-slate-200 rounded-md divide-y divide-slate-100">
                  {aliases.map((a) => (
                    <li key={a} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-slate-700">{a}</span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                        title="Remove"
                        disabled={aliasBusy}
                        onClick={() => handleRemoveAlias(a)}
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

      <div className="flex justify-end items-center gap-3">
        {saveError && <p className="text-sm text-red-500">{saveError}</p>}
        {saveSuccess && <p className="text-sm text-emerald-600">Saved!</p>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
