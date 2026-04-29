"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Plus, Send, Trash2, Copy, Check, Users, RefreshCw } from "lucide-react";

interface Invitation {
  id: string;
  email: string;
  displayName: string;
  expiresAt: string;
  status: "pending" | "completed" | "revoked" | "expired";
  createdAt: string;
  completedAt: string | null;
}

interface NewInvitationResult {
  id: string;
  email: string;
  displayName: string;
  expiresAt: string;
  status: string;
  signupUrl: string;
  emailed?: boolean;
  emailError?: string | null;
}

const STATUS_VARIANT: Record<Invitation["status"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "default",
  completed: "secondary",
  revoked: "destructive",
  expired: "outline",
};

export default function AdminInvitationsPage() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [linkResult, setLinkResult] = useState<NewInvitationResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invitations");
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error ?? "Failed to create invitation");
        return;
      }
      const data: NewInvitationResult = await res.json();
      setCreateOpen(false);
      setEmail("");
      setDisplayName("");
      setLinkResult(data);
      load();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this invitation? The signup link will stop working immediately.")) return;
    await fetch(`/api/admin/invitations/${id}`, { method: "DELETE" });
    load();
  }

  async function handleResend(id: string) {
    if (!confirm("Resend this invitation? A new link will be generated and the old one will stop working.")) return;
    const res = await fetch(`/api/admin/invitations/${id}/resend`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setLinkResult({
        id,
        email: items.find((i) => i.id === id)?.email ?? "",
        displayName: items.find((i) => i.id === id)?.displayName ?? "",
        expiresAt: data.expiresAt,
        status: "pending",
        signupUrl: data.signupUrl,
        emailed: data.emailed,
        emailError: data.emailError,
      });
      load();
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold">Invitations</h2>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/users">
            <Button variant="ghost" size="sm">
              <Users className="h-4 w-4 mr-1" /> Users
            </Button>
          </Link>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New invitation
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <Th>Customer</Th>
              <Th>Status</Th>
              <Th>Expires</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-400">No invitations yet.</td></tr>
            ) : (
              items.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium">{inv.displayName}</p>
                    <p className="text-xs text-slate-400">{inv.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[inv.status]} className="text-[10px] capitalize">{inv.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {new Date(inv.expiresAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {new Date(inv.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(inv.status === "pending" || inv.status === "expired") && (
                        <Button variant="ghost" size="sm" onClick={() => handleResend(inv.id)}>
                          <RefreshCw className="h-4 w-4 mr-1" /> {inv.status === "expired" ? "Renew" : "Resend"}
                        </Button>
                      )}
                      {inv.status === "pending" && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Revoke
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); setCreateError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a customer</DialogTitle>
            <DialogDescription>
              You&apos;ll get a one-time signup link. Send it to the customer; the account
              isn&apos;t created until they complete signup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !email || !displayName}>
              <Send className="h-4 w-4 mr-1" /> {creating ? "Creating…" : "Create invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link reveal dialog (one-shot) */}
      <Dialog open={!!linkResult} onOpenChange={(o) => { if (!o) setLinkResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signup link</DialogTitle>
            <DialogDescription>
              {linkResult?.emailed
                ? <>An email has been sent to <span className="font-medium">{linkResult?.email}</span>. The link below is shown <strong>once</strong> as a backup. Expires {linkResult ? new Date(linkResult.expiresAt).toLocaleString() : ""}.</>
                : <>This link is shown <strong>once</strong>. Copy it now and send it to <span className="font-medium">{linkResult?.email}</span>. Expires {linkResult ? new Date(linkResult.expiresAt).toLocaleString() : ""}.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {linkResult?.emailError && (
              <p className="text-sm text-red-600">Email send failed: {linkResult.emailError}. Copy the link manually.</p>
            )}
            {!linkResult?.emailed && !linkResult?.emailError && (
              <p className="text-xs text-slate-500">SMTP is not configured — link must be sent manually. Set SMTP_HOST/USER/PASS/FROM in environment to enable automatic email.</p>
            )}
            <Label>Signup URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={linkResult?.signupUrl ?? ""} className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={() => linkResult && copyLink(linkResult.signupUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setLinkResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${className}`}>
      {children}
    </th>
  );
}
