# Task 31 — Send Fax Page (Multiple Recipients)

## Goal
Build the send fax form with: add/remove multiple recipients manually, subject, cover page toggle + template select + **template fields editing modal** (FaxBack dynamic placeholders), cover message, file upload, **resolution dropdown**, advanced options, and send button.

## Files to Create
- `src/app/(portal)/send/page.tsx`
- `src/components/fax/send-form.tsx`
- `src/components/fax/template-fields-modal.tsx`

## Dependencies
- UI components from shadcn (already installed)
- `src/types/index.ts` (task 12)
- API routes built in task 34

## Design Reference (from design doc section 7.2)

**Simple Send fields:**
- To: one or more recipients — each row has fax number + optional name; add/remove rows
- Subject: optional
- Cover page: toggle on/off, select template, enter cover message, **"Edit Template Fields" button** → opens modal with all 6 FaxBack dynamic field overrides
- Attachments: upload PDF, TIFF, Word, or text files (drag and drop)
- Send button with count badge (e.g. "Send Fax to 3 recipients")

**Advanced Options (collapsible):**
- Schedule send (future date/time)
- **Resolution** (Standard 200×100, Fine 200×200, Superfine 200×400)
- Billing code
- Sender info overrides (name, company, fax number, voice number)

## Implementation

### 1. Create `src/components/fax/template-fields-modal.tsx`

Modal for editing FaxBack cover page dynamic placeholder values. These are the `$(SenderName)`, `$(SenderCompany)`, etc. values that get injected into the selected RTF cover template at send time.

```tsx
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TemplateFieldValues {
  senderName: string;
  senderCompany: string;
  senderFax: string;
  senderVoice: string;
  receiverName: string;
  receiverCompany: string;
}

const defaultFields: TemplateFieldValues = {
  senderName: "",
  senderCompany: "",
  senderFax: "",
  senderVoice: "",
  receiverName: "",
  receiverCompany: "",
};

interface TemplateFieldsModalProps {
  open: boolean;
  onClose: () => void;
  values: TemplateFieldValues;
  onSave: (values: TemplateFieldValues) => void;
}

export function TemplateFieldsModal({ open, onClose, values, onSave }: TemplateFieldsModalProps) {
  const [fields, setFields] = useState<TemplateFieldValues>(defaultFields);

  useEffect(() => {
    if (open) setFields(values);
  }, [open, values]);

  function handleSave() {
    onSave(fields);
    onClose();
  }

  const fieldDefs = [
    { key: "senderName" as const, label: "Sender Name", placeholder: "Your Name", code: "$(SenderName)" },
    { key: "senderCompany" as const, label: "Sender Company", placeholder: "Your Company", code: "$(SenderCompany)" },
    { key: "senderFax" as const, label: "Sender Fax Number", placeholder: "(555) 123-4567", code: "$(SenderFax)" },
    { key: "senderVoice" as const, label: "Sender Voice Number", placeholder: "(555) 987-6543", code: "$(SenderVoice)" },
    { key: "receiverName" as const, label: "Receiver Name", placeholder: "Recipient Name", code: "$(ReceiverName)" },
    { key: "receiverCompany" as const, label: "Receiver Company", placeholder: "Recipient Company", code: "$(ReceiverCompany)" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>⚙</span> Cover Page Template Fields
          </DialogTitle>
          <p className="text-xs text-slate-400 mt-1">
            These values replace dynamic placeholders in the selected cover page template.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {fieldDefs.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{f.label}</Label>
                <code className="text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                  {f.code}
                </code>
              </div>
              <Input
                value={fields[f.key]}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Fields</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 2. Create `src/components/fax/send-form.tsx`

Client component with the full send form. Supports multiple recipients (add/remove rows), cover page with template fields modal, resolution selector, and all advanced options. Calls `POST /api/fax/send` on submit.

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Send, Paperclip, ChevronDown, ChevronUp, X, Upload, Plus, Settings2 } from "lucide-react";
import { TemplateFieldsModal, type TemplateFieldValues } from "./template-fields-modal";

interface Recipient {
  faxNumber: string;
  name: string;
}

interface SendFormProps {
  coverTemplates: Array<{ id: string; templateName: string; isDefault: boolean }>;
}

const RESOLUTION_OPTIONS = [
  { value: "0", label: "Standard (200×100 DPI)" },
  { value: "2", label: "Fine (200×200 DPI)" },
  { value: "3", label: "Superfine (200×400 DPI)" },
];

export function SendForm({ coverTemplates }: SendFormProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Recipients (array of rows — always at least one)
  const [recipients, setRecipients] = useState<Recipient[]>([{ faxNumber: "", name: "" }]);
  const [subject, setSubject] = useState("");

  // Cover page
  const [useCover, setUseCover] = useState(false);
  const [coverTemplate, setCoverTemplate] = useState(
    coverTemplates.find((t) => t.isDefault)?.templateName || ""
  );
  const [coverMessage, setCoverMessage] = useState("");
  const [templateFieldsOpen, setTemplateFieldsOpen] = useState(false);
  const [templateFields, setTemplateFields] = useState<TemplateFieldValues>({
    senderName: "", senderCompany: "", senderFax: "", senderVoice: "", receiverName: "", receiverCompany: "",
  });

  // Files
  const [files, setFiles] = useState<File[]>([]);

  // Advanced
  const [resolution, setResolution] = useState("0"); // 0=Standard, 2=Fine, 3=Superfine
  const [scheduleTime, setScheduleTime] = useState("");
  const [billingCode, setBillingCode] = useState("");

  // --- Recipient helpers ---
  function addRecipient() {
    setRecipients((prev) => [...prev, { faxNumber: "", name: "" }]);
  }

  function removeRecipient(index: number) {
    if (recipients.length <= 1) return; // keep at least one
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRecipient(index: number, field: keyof Recipient, value: string) {
    setRecipients((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  // --- File helpers ---
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  }, []);

  // --- Submit ---
  const validRecipients = recipients.filter((r) => r.faxNumber.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (validRecipients.length === 0) {
      setError("At least one recipient fax number is required");
      return;
    }

    setSending(true);

    try {
      // Convert files to base64
      const documents = await Promise.all(
        files.map(async (file) => {
          const buffer = await file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          return { name: file.name, contentBase64: base64 };
        })
      );

      const res = await fetch("/api/fax/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: validRecipients,
          subject,
          useCover,
          coverTemplate: useCover ? coverTemplate : undefined,
          coverMessage: useCover ? coverMessage : undefined,
          templateFields: useCover ? templateFields : undefined,
          documents,
          resolution: parseInt(resolution, 10),
          scheduleTime: scheduleTime || undefined,
          billingCode: billingCode || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed to send fax");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/sent"), 2000);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setSending(false);
    }
  }

  if (success) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <Send className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Fax Queued!</h2>
          <p className="text-sm text-slate-500">
            Sending to {validRecipients.length} recipient{validRecipients.length > 1 ? "s" : ""}. Redirecting to sent items...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recipients</CardTitle>
            <span className="text-xs text-slate-400">
              Sending to {validRecipients.length} recipient{validRecipients.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {recipients.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <Input
                placeholder="Fax number — (555) 123-4567"
                value={r.faxNumber}
                onChange={(e) => updateRecipient(i, "faxNumber", e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Recipient name (optional)"
                value={r.name}
                onChange={(e) => updateRecipient(i, "name", e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-slate-400 hover:text-red-500"
                onClick={() => removeRecipient(i)}
                disabled={recipients.length <= 1}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addRecipient}>
            <Plus className="h-4 w-4 mr-1" /> Add Recipient
          </Button>

          <div className="space-y-2 pt-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Optional subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cover Page */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Cover Page</CardTitle>
            <Switch checked={useCover} onCheckedChange={setUseCover} />
          </div>
        </CardHeader>
        {useCover && (
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label>Template</Label>
                <select
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  value={coverTemplate}
                  onChange={(e) => setCoverTemplate(e.target.value)}
                >
                  <option value="">None</option>
                  {coverTemplates.map((t) => (
                    <option key={t.id} value={t.templateName}>
                      {t.templateName} {t.isDefault ? "(Default)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setTemplateFieldsOpen(true)}>
                <Settings2 className="h-4 w-4 mr-1" /> Edit Template Fields
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Cover Message</Label>
              <Textarea
                placeholder="Message to appear on the cover page..."
                value={coverMessage}
                onChange={(e) => setCoverMessage(e.target.value)}
                rows={4}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Template Fields Modal */}
      <TemplateFieldsModal
        open={templateFieldsOpen}
        onClose={() => setTemplateFieldsOpen(false)}
        values={templateFields}
        onSave={setTemplateFields}
      />

      {/* Attachments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Attachments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <Upload className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Drop files here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">PDF, TIFF, Word, TXT — max 20MB each</p>
            <input
              id="file-upload"
              type="file"
              multiple
              accept=".pdf,.tif,.tiff,.doc,.docx,.txt,.rtf,.html"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg text-sm">
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Options */}
      <Card>
        <CardHeader className="pb-0 cursor-pointer" onClick={() => setShowAdvanced(!showAdvanced)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Advanced Options</CardTitle>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Resolution</Label>
                <select
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                >
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Schedule Send</Label>
                <Input type="datetime-local" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Billing Code</Label>
              <Input placeholder="Optional" value={billingCode} onChange={(e) => setBillingCode(e.target.value)} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Submit */}
      <Button type="submit" size="lg" className="w-full" disabled={sending || validRecipients.length === 0 || files.length === 0}>
        <Send className="h-4 w-4 mr-2" />
        {sending
          ? "Sending..."
          : `Send Fax${validRecipients.length > 1 ? ` to ${validRecipients.length} Recipients` : ""}`}
      </Button>
    </form>
  );
}
```

### 3. Create `src/app/(portal)/send/page.tsx`

Server component that fetches cover templates and renders the form.

```tsx
import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { containers } from "@/lib/db/cosmos";
import { SendForm } from "@/components/fax/send-form";

export default async function SendFaxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch cover templates for this user + domain-level templates
  const templatesContainer = await containers.coverTemplates();
  const { resources: templates } = await templatesContainer.items
    .query({
      query: "SELECT c.id, c.templateName, c.isDefault FROM c WHERE c.userId = @uid OR c.userId = null",
      parameters: [{ name: "@uid", value: user.id }],
    })
    .fetchAll();

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Send Fax</h2>
      <SendForm coverTemplates={templates} />
    </div>
  );
}
```

## Verify
- `npm run build` — no errors
- `/send` shows the compose form with all sections
- Add/remove recipient rows works (minimum 1)
- Cover page toggle shows template select + "Edit Template Fields" button
- Template Fields modal opens with all 6 FaxBack placeholder fields
- Resolution dropdown appears in Advanced Options
- File drag-and-drop works
- Submit button shows recipient count

## Notes
- The actual `POST /api/fax/send` route is built in task 34 — update it to accept `recipients[]` array, `resolution`, and `templateFields`
- Contact picker (search/select from contacts) is enhanced in task 40
- The `templateFields` values map to FaxBack's `SendMessage` XML: `SenderName`, `SenderCompany`, `SenderFaxNumber`, `SenderVoiceNumber` + cover page RTF replacement for `ReceiverName`/`ReceiverCompany`
