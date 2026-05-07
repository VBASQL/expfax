"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Send, Paperclip, ChevronDown, ChevronUp, X, Upload, Plus, Image as ImageIcon, Eye } from "lucide-react";
import { FaxPreviewModal, type CoverPreviewInfo } from "./fax-preview-modal";

/** Renders a small thumbnail for image File objects, revoking the object URL on cleanup. */
function FileThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? (
    <img src={url} alt="" className="h-10 w-10 object-cover rounded border border-slate-200 shrink-0" />
  ) : (
    <ImageIcon className="h-4 w-4 text-blue-400 shrink-0" />
  );
}

interface Recipient {
  faxNumber: string;
  name: string;
}

interface FromAccount {
  accountGuid: string;
  accountId: string;
  faxNumber: string | null;
  label: string | null;
}

interface SendFormProps {
  coverTemplates: Array<{ id: string; templateName: string; bodyText: string; isDefault: boolean }>;
  fromAccounts?: FromAccount[];         // All linked FaxBack accounts for the user
  defaultAccountGuid?: string | null;   // Which to pre-select
}

const RESOLUTION_OPTIONS = [
  { value: "0", label: "Standard (200×100 DPI)" },
  { value: "2", label: "Fine (200×200 DPI)" },
  { value: "3", label: "Superfine (200×400 DPI)" },
];

export function SendForm({ coverTemplates, fromAccounts = [], defaultAccountGuid }: SendFormProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Which account to send from (only relevant when user has multiple accounts)
  const [fromAccountGuid, setFromAccountGuid] = useState<string>(
    defaultAccountGuid ?? fromAccounts[0]?.accountGuid ?? ""
  );

  // Recipients (array of rows — always at least one)
  const [recipients, setRecipients] = useState<Recipient[]>([{ faxNumber: "", name: "" }]);
  const [subject, setSubject] = useState("");

  // Cover page
  const [useCover, setUseCover] = useState(false);
  // Selected template ID ("") = none — template provides letterhead + default body text
  const defaultTemplate = coverTemplates.find((t) => t.isDefault);
  const [coverTemplateId, setCoverTemplateId] = useState(defaultTemplate?.id ?? "");
  // One-time cover page fields
  const [oneTimeCover, setOneTimeCover] = useState({
    senderName: "",
    senderCompany: "",
    senderFax: "",
    senderVoice: "",
    receiverName: "",
    receiverCompany: "",
    message: "",
  });

  // Files
  const [files, setFiles] = useState<File[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

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

  const moveFile = (from: number, to: number) => {
    if (to < 0 || to >= files.length) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
    if (sendingRef.current) return;
    sendingRef.current = true;
    setError("");

    if (validRecipients.length === 0) {
      setError("At least one recipient fax number is required");
      sendingRef.current = false;
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
          oneTimeCover: useCover ? { ...oneTimeCover, subject } : undefined,
          coverTemplateId: useCover ? (coverTemplateId || undefined) : undefined,
          documents,
          resolution: parseInt(resolution, 10),
          scheduleTime: scheduleTime || undefined,
          billingCode: billingCode || undefined,
          fromAccountGuid: fromAccountGuid || undefined,
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
      sendingRef.current = false;
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

      {/* From Account selector — only shown when user has multiple linked accounts */}
      {fromAccounts.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Send From</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
              value={fromAccountGuid}
              onChange={(e) => setFromAccountGuid(e.target.value)}
            >
              {fromAccounts.map((a) => (
                <option key={a.accountGuid} value={a.accountGuid}>
                  {a.label
                    ? `${a.label} (${a.accountId}${a.faxNumber ? ` · ${a.faxNumber}` : ""})`
                    : `${a.accountId}${a.faxNumber ? ` · ${a.faxNumber}` : ""}`}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
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
          <CardContent>
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
              {/* Template selector */}
              {coverTemplates.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Template (letterhead + default message)</Label>
                  <select
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    value={coverTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setCoverTemplateId(id);
                      const tpl = coverTemplates.find((t) => t.id === id);
                      if (tpl?.bodyText) {
                        setOneTimeCover((v) => ({ ...v, message: tpl.bodyText }));
                      }
                    }}
                  >
                    <option value="">No template (plain cover)</option>
                    {coverTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.templateName}{t.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Fill in the details for this cover page. It will be generated and sent as the first page of the fax.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Your Name</Label>
                  <Input
                    placeholder="Sender name"
                    value={oneTimeCover.senderName}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Your Company</Label>
                  <Input
                    placeholder="Company name"
                    value={oneTimeCover.senderCompany}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderCompany: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Your Fax Number</Label>
                  <Input
                    placeholder="(555) 123-4567"
                    value={oneTimeCover.senderFax}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderFax: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Your Voice Number</Label>
                  <Input
                    placeholder="(555) 987-6543"
                    value={oneTimeCover.senderVoice}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, senderVoice: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient Name</Label>
                  <Input
                    placeholder="Recipient name"
                    value={oneTimeCover.receiverName}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, receiverName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient Company</Label>
                  <Input
                    placeholder="Recipient company"
                    value={oneTimeCover.receiverCompany}
                    onChange={(e) => setOneTimeCover((v) => ({ ...v, receiverCompany: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cover Message</Label>
                <Textarea
                  placeholder="Message to appear on the cover page..."
                  value={oneTimeCover.message}
                  onChange={(e) => setOneTimeCover((v) => ({ ...v, message: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Fax Preview Modal */}
      <FaxPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        files={files}
        cover={useCover ? {
            mode: "onetime",
            senderName: oneTimeCover.senderName,
            senderCompany: oneTimeCover.senderCompany,
            senderFax: oneTimeCover.senderFax,
            senderVoice: oneTimeCover.senderVoice,
            receiverName: oneTimeCover.receiverName,
            receiverCompany: oneTimeCover.receiverCompany,
            subject,
            message: oneTimeCover.message,
          } : undefined}
      />

      {/* Attachments */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Attachments</CardTitle>
            {(files.length > 0 || useCover) && (
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-4 w-4 mr-1" /> Preview Fax
              </Button>
            )}
          </div>
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
            <p className="text-xs text-slate-400 mt-1">
              PDF · TIFF · Word (DOCX) · RTF · TXT · HTML ·{" "}
              <span className="font-medium text-blue-500">PNG · JPEG · WEBP · BMP · GIF</span>
              {" "}— max 20 MB each
            </p>
            <p className="text-[11px] text-slate-300 mt-0.5">Images are converted to TIFF automatically</p>
            <input
              id="file-upload"
              type="file"
              multiple
              accept=".pdf,.tif,.tiff,.doc,.docx,.txt,.rtf,.html,.png,.jpg,.jpeg,.webp,.bmp,.gif,.dcx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((file, i) => {
                const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                const isImage = ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(ext);
                return (
                  <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-sm">
                    {/* Thumbnail or icon */}
                    {isImage
                      ? <FileThumb file={file} />
                      : <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />}

                    <span className="flex-1 truncate min-w-0">{file.name}</span>

                    {isImage && (
                      <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 shrink-0">
                        → TIFF
                      </span>
                    )}

                    <span className="text-xs text-slate-400 shrink-0">{(file.size / 1024).toFixed(0)} KB</span>

                    {/* Reorder */}
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        onClick={() => moveFile(i, i - 1)}
                        disabled={i === 0}
                        className="text-slate-300 hover:text-slate-600 disabled:opacity-25 disabled:cursor-default"
                        title="Move up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFile(i, i + 1)}
                        disabled={i === files.length - 1}
                        className="text-slate-300 hover:text-slate-600 disabled:opacity-25 disabled:cursor-default"
                        title="Move down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>

                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
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
      <Button type="submit" size="lg" className="w-full" disabled={sending || validRecipients.length === 0 || (files.length === 0 && !useCover)}>
        <Send className="h-4 w-4 mr-2" />
        {sending
          ? "Sending..."
          : `Send Fax${validRecipients.length > 1 ? ` to ${validRecipients.length} Recipients` : ""}`}
      </Button>
    </form>
  );
}
