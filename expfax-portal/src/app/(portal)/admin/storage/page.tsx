"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HardDrive, File, Trash2, Plus, PlayCircle } from "lucide-react";

interface StorageStats {
  received: { count: number; sizeMB: number };
  sent: { count: number; sizeMB: number };
  total: { count: number; sizeMB: number };
}

interface Override {
  userId: string;
  retentionDays: number;
  reason: string;
}

interface RetentionConfig {
  globalRetentionDays: number;
  overrides: Override[];
}

interface CleanupResult {
  ranAt: string;
  deletedFaxes: number;
  deletedBlobs: number;
  failedDeletes: number;
  durationMs: number;
  skipped?: string;
}

export default function StorageRetentionPage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [config, setConfig] = useState<RetentionConfig>({ globalRetentionDays: 365, overrides: [] });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<CleanupResult | null>(null);

  const loadStats = useCallback(() => {
    fetch("/api/admin/storage").then((r) => r.json()).then(setStats);
  }, []);

  const loadConfig = useCallback(() => {
    fetch("/api/admin/storage/retention").then((r) => r.json()).then((data) => {
      setConfig({ globalRetentionDays: data.globalRetentionDays ?? 365, overrides: data.overrides ?? [] });
    });
  }, []);

  useEffect(() => { loadStats(); loadConfig(); }, [loadStats, loadConfig]);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/admin/storage/retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
  }

  async function handleRunNow() {
    if (!confirm(
      "Run retention cleanup now?\n\nThis will permanently delete faxes (PDFs + records) older than the configured policy. This action cannot be undone."
    )) return;
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch("/api/admin/storage/retention/run", { method: "POST" });
      const data = await res.json();
      setLastRun(data);
      // Refresh storage stats so the user sees the impact.
      loadStats();
    } catch (err) {
      console.error(err);
      alert("Cleanup failed. Check server logs.");
    } finally {
      setRunning(false);
    }
  }

  function addOverride() {
    setConfig((c) => ({ ...c, overrides: [...c.overrides, { userId: "", retentionDays: 365, reason: "" }] }));
  }

  function removeOverride(idx: number) {
    setConfig((c) => ({ ...c, overrides: c.overrides.filter((_, i) => i !== idx) }));
  }

  function updateOverride(idx: number, field: keyof Override, value: string | number) {
    setConfig((c) => {
      const overrides = [...c.overrides];
      overrides[idx] = { ...overrides[idx], [field]: value };
      return { ...c, overrides };
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Storage & Retention</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Received Faxes", data: stats?.received, icon: <HardDrive className="h-5 w-5 text-blue-400" /> },
          { label: "Sent Faxes", data: stats?.sent, icon: <File className="h-5 w-5 text-emerald-400" /> },
          { label: "Total Storage", data: stats?.total, icon: <HardDrive className="h-5 w-5 text-slate-400" /> },
        ].map(({ label, data, icon }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                {icon}
                <span className="text-sm font-medium text-slate-600">{label}</span>
              </div>
              {data ? (
                <>
                  <p className="text-2xl font-bold">{data.count.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{data.sizeMB} MB</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">Loading...</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="font-medium text-sm text-slate-700">Global Retention Policy</h3>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label>Retention Days</Label>
              <Input
                type="number"
                value={config.globalRetentionDays}
                onChange={(e) => setConfig((c) => ({ ...c, globalRetentionDays: Number(e.target.value) }))}
                className="w-32"
                min={1}
              />
            </div>
            <p className="text-sm text-slate-400 pb-2">
              ≈ {(config.globalRetentionDays / 365).toFixed(1)} years
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-slate-700">Per-Customer Overrides</h3>
            <Button variant="outline" size="sm" onClick={addOverride}>
              <Plus className="h-4 w-4 mr-1" /> Add Override
            </Button>
          </div>

          {config.overrides.length === 0 ? (
            <p className="text-sm text-slate-400">No overrides configured</p>
          ) : (
            <div className="space-y-3">
              {config.overrides.map((ov, idx) => (
                <div key={idx} className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">User ID</Label>
                    <Input
                      value={ov.userId}
                      onChange={(e) => updateOverride(idx, "userId", e.target.value)}
                      placeholder="user-id"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Days</Label>
                    <Input
                      type="number"
                      value={ov.retentionDays}
                      onChange={(e) => updateOverride(idx, "retentionDays", Number(e.target.value))}
                      min={1}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Reason</Label>
                    <Input
                      value={ov.reason}
                      onChange={(e) => updateOverride(idx, "reason", e.target.value)}
                      placeholder="Legal hold, etc."
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-red-400 hover:text-red-600" onClick={() => removeOverride(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm text-slate-700">Cleanup Job</h3>
              <p className="text-xs text-slate-500 mt-1">
                Runs automatically once every 24 hours. You can also trigger it manually.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRunNow} disabled={running}>
              <PlayCircle className="h-4 w-4 mr-1" />
              {running ? "Running..." : "Run cleanup now"}
            </Button>
          </div>
          {lastRun && (
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-3">
              {lastRun.skipped === "recently_ran" ? (
                <p>Skipped — another instance ran cleanup within the last 23 hours.</p>
              ) : lastRun.skipped === "no_config" ? (
                <p>Skipped — no retention config saved yet.</p>
              ) : (
                <>
                  <p>
                    Ran at {new Date(lastRun.ranAt).toLocaleString()} in {(lastRun.durationMs / 1000).toFixed(1)}s.
                  </p>
                  <p>
                    Deleted <strong>{lastRun.deletedFaxes}</strong> fax records and{" "}
                    <strong>{lastRun.deletedBlobs}</strong> blob files.
                    {lastRun.failedDeletes > 0 && (
                      <span className="text-red-600"> {lastRun.failedDeletes} failures (see logs).</span>
                    )}
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Retention Policy"}
        </Button>
      </div>
    </div>
  );
}
