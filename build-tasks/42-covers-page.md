# Task 42 — Cover Page Template Management UI

## Goal
Build the cover page template management page: list templates, upload new, download, delete, set default, preview.

## Files to Create
- `src/app/(portal)/covers/page.tsx`

## Dependencies
- API routes from task 43
- shadcn Dialog component

## Design (from design doc section 7.7)
- Grid of template cards with name, preview icon, upload date
- Upload new template (RTF format — FaxBack uses RTF)
- Download existing template
- Delete template
- Set default template
- Preview with sample data
- `AddTemplate` with `FailIfExists=false` to overwrite existing

## Implementation

### Create `src/app/(portal)/covers/page.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Download, Trash2, Star, FileText, Upload } from "lucide-react";

interface Template {
  id: string;
  templateName: string;
  isDefault: boolean;
  createdAt: string;
}

export default function CoverPagesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    fetch("/api/templates").then((r) => r.json()).then((data) => setTemplates(data.items || []));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUpload() {
    if (!uploadFile || !uploadName) return;
    setUploading(true);

    const buffer = await uploadFile.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: uploadName, contentBase64: base64 }),
    });

    setUploading(false);
    setUploadOpen(false);
    setUploadName("");
    setUploadFile(null);
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

  async function handleDownload(id: string, name: string) {
    const res = await fetch(`/api/templates/${id}/download`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.rtf`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cover Page Templates</h2>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Upload Template
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {templates.map((t) => (
          <Card key={t.id} className={`hover:shadow-md transition-all ${t.isDefault ? "border-emerald-300" : ""}`}>
            <CardContent className="p-5 text-center">
              <div className="w-20 h-24 bg-slate-100 rounded mx-auto mb-3 flex items-center justify-center">
                <FileText className="h-8 w-8 text-slate-300" />
              </div>
              <p className="text-sm font-semibold mb-1">{t.templateName}</p>
              <p className="text-xs text-slate-400 mb-3">
                {new Date(t.createdAt).toLocaleDateString()}
              </p>
              {t.isDefault && (
                <Badge className="bg-emerald-50 text-emerald-700 text-[10px] mb-3">Default</Badge>
              )}
              <div className="flex items-center justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSetDefault(t.id)} title="Set as default">
                  <Star className={`h-4 w-4 ${t.isDefault ? "fill-amber-400 text-amber-400" : "text-slate-400"}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(t.id, t.templateName)} title="Download">
                  <Download className="h-4 w-4 text-slate-400" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(t.id, t.templateName)} title="Delete">
                  <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-slate-400 col-span-4 text-center py-8">No templates uploaded yet</p>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Cover Page Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g., Standard Cover" />
            </div>
            <div className="space-y-2">
              <Label>Template File (RTF) *</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => document.getElementById("template-file")?.click()}>
                <Upload className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">{uploadFile ? uploadFile.name : "Click to select RTF file"}</p>
                <input id="template-file" type="file" accept=".rtf" className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadName || !uploadFile}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/covers` shows template grid with upload, download, delete, set default actions
