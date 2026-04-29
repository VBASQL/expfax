"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface EmailSettings {
  inboundEnabled?: boolean;
  emailAlias?: string;
  includeCoverPage?: boolean;
  outboundEnabled?: boolean;
  deliveryEmail?: string;
  format?: string;
  notifyOnSend?: boolean;
  notifyOnFail?: boolean;
}

export default function AdminEmailConfigPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [settings, setSettings] = useState<EmailSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}/email`)
      .then((r) => r.json())
      .then((data) => { setSettings(data); setLoading(false); });
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/admin/users/${userId}/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-slate-400 p-6">Loading...</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Email Configuration</h2>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-medium text-sm text-slate-700">Inbound: Email → Fax</h3>
          <div className="flex items-center justify-between">
            <Label>Enable Email-to-Fax</Label>
            <Switch
              checked={settings.inboundEnabled ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, inboundEnabled: v }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Email Alias</Label>
            <Input
              value={settings.emailAlias ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, emailAlias: e.target.value }))}
              placeholder="user@fax.domain.com"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Include Cover Page</Label>
            <Switch
              checked={settings.includeCoverPage ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, includeCoverPage: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-medium text-sm text-slate-700">Outbound: Fax → Email</h3>
          <div className="flex items-center justify-between">
            <Label>Enable Fax-to-Email</Label>
            <Switch
              checked={settings.outboundEnabled ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, outboundEnabled: v }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Delivery Email</Label>
            <Input
              value={settings.deliveryEmail ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, deliveryEmail: e.target.value }))}
              placeholder="inbox@company.com"
            />
          </div>
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
          <div className="flex items-center justify-between">
            <Label>Notify on Send</Label>
            <Switch
              checked={settings.notifyOnSend ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, notifyOnSend: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Notify on Failure</Label>
            <Switch
              checked={settings.notifyOnFail ?? false}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, notifyOnFail: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
