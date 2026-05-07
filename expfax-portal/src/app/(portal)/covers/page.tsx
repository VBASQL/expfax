"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Star, FileText, ImageIcon, X, Pencil, Info } from "lucide-react";

interface Template {
  id: string;
  templateName: string;
  bodyText: string;
  headerImageBase64?: string;
  headerImageType?: "png" | "jpeg";
  isDefault: boolean;
  createdAt: string;
}

const PLACEHOLDER_HINTS = [
  { code: "$(SenderName)", label: "Sender name" },
  { code: "$(SenderCompany)", label: "Sender company" },
  { code: "$(SenderFax)", label: "Sender fax" },
  { code: "$(SenderVoice)", label: "Sender voice" },
  { code: "$(ReceiverName)", label: "Recipient name" },
  { code: "$(ReceiverCompany)", label: "Recipient company" },
  { code: "$(Subject)", label: "Subject" },
  { code: "$(Date)", label: "Date" },
  { code: "$(Comments)", label: "Cover message" },
];

const MAX_IMAGE_KB = 512;

function emptyForm() {
  return { name: "", bodyText: "", headerImageBase64: "", headerImageType: "" as "" | "png" | "jpeg" };
}

export default function CoverPagesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [headerPreview, setHeaderPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showHints, setShowHints] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.items || []));
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setHeaderPreview("");
    setError("");
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setForm({
      name: t.templateName,
      bodyText: t.bodyText || "",
      headerImageBase64: t.headerImageBase64 || "",
      headerImageType: t.headerImageType || "",
    });
    setHeaderPreview(
      t.headerImageBase64
        ? `data:image/${t.headerImageType ?? "png"};base64,${t.headerImageBase64}`
        : ""
    );
    setError("");
    setDialogOpen(true);
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_IMAGE_KB * 1024) {
      setError(`Header image must be under ${MAX_IMAGE_KB} KB.`);
      return;
    }
    const imgType = file.type.includes("png") ? "png" : "jpeg";
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setForm((f) => ({ ...f, headerImageBase64: base64, headerImageType: imgType }));
      setHeaderPreview(dataUrl);
      setError("");
    };
    reader.readAsDataURL(file);
  }

  function removeHeaderImage() {
    setForm((f) => ({ ...f, headerImageBase64: "", headerImageType: "" }));
    setHeaderPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Template name is required."); return; }
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      bodyText: form.bodyText,
      headerImageBase64: form.headerImageBase64 || undefined,
      headerImageType: form.headerImageType || undefined,
    };

    const res = await fetch(
      editingId ? `/api/templates/${editingId}` : "/api/templates",
      {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    setSaving(false);

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save template.");
      return;
    }

    setDialogOpen(false);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"?`)) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    load();
  }

  async function handleSetDefault(id: string) {
    await fetch(`/api/templates/${id}/default`, { method: "POST" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cover Page Templates</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Define reusable cover pages with placeholders. A PDF is generated automatically when a fax is sent.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((t) => (
          <Card key={t.id} className={`hover:shadow-md transition-all ${t.isDefault ? "border-emerald-300" : ""}`}>
            <CardContent className="p-5 text-center">
              <div className="w-20 h-24 bg-slate-100 rounded mx-auto mb-3 flex items-center justify-center overflow-hidden">
                {t.headerImageBase64 ? (
                  <img
                    src={`data:image/${t.headerImageType ?? "png"};base64,${t.headerImageBase64}`}
                    alt="Header"
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <FileText className="h-8 w-8 text-slate-300" />
                )}
              </div>
              <p className="text-sm font-semibold mb-1 truncate">{t.templateName}</p>
              <p className="text-xs text-slate-400 mb-3">
                {new Date(t.createdAt).toLocaleDateString()}
              </p>
              {t.isDefault && (
                <Badge className="bg-emerald-50 text-emerald-700 text-[10px] mb-3">Default</Badge>
              )}
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} title="Edit">
                  <Pencil className="h-4 w-4 text-slate-400" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSetDefault(t.id)} title="Set as default">
                  <Star className={`h-4 w-4 ${t.isDefault ? "fill-amber-400 text-amber-400" : "text-slate-400"}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(t.id, t.templateName)} title="Delete">
                  <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-slate-400 col-span-4 text-center py-8">
            No templates yet. Click &ldquo;New Template&rdquo; to create one.
          </p>
        )}
      </div>

      {/* Template Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Cover Page Template"}</DialogTitle>
            <DialogDescription>
              Fill in the fields below. Use placeholder codes in the body — they are substituted with real values when you send a fax.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Template Name <span className="text-red-500">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Standard Cover, Legal Cover"
              />
            </div>

            {/* Header image (optional letterhead) */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <ImageIcon className="h-3.5 w-3.5" />
                Company Header / Letterhead
                <span className="text-xs text-slate-400 font-normal ml-1">(optional, PNG or JPEG, max {MAX_IMAGE_KB} KB)</span>
              </Label>
              {headerPreview ? (
                <div className="relative border rounded-lg overflow-hidden">
                  <img src={headerPreview} alt="Header preview" className="w-full max-h-28 object-contain bg-slate-50" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 bg-white/80 hover:bg-white"
                    onClick={removeHeaderImage}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); }}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <ImageIcon className="h-5 w-5 text-slate-300 mx-auto mb-1" />
                  <p className="text-xs text-slate-400">Click or drag to upload company logo / letterhead</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
              />
            </div>

            {/* Body text */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Cover Body / Message</Label>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
                  onClick={() => setShowHints((v) => !v)}
                >
                  <Info className="h-3 w-3" />
                  {showHints ? "Hide placeholders" : "Show placeholders"}
                </button>
              </div>
              {showHints && (
                <div className="bg-slate-50 border rounded-md p-3 flex flex-wrap gap-2">
                  {PLACEHOLDER_HINTS.map((h) => (
                    <button
                      key={h.code}
                      type="button"
                      title={`Insert ${h.label}`}
                      className="font-mono text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      onClick={() => setForm((f) => ({ ...f, bodyText: f.bodyText + h.code }))}
                    >
                      {h.code}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                rows={5}
                value={form.bodyText}
                onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                placeholder={`The body message shown on the cover page.\n\nYou can use $(Comments) here to include the per-fax message entered at send time.`}
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">
                The standard fields (Date, To, From, Subject, etc.) are always included automatically above this body.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
