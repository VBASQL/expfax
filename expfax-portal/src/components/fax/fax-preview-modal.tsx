"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Image as ImageIcon, File, Loader2 } from "lucide-react";

export interface CoverPreviewInfo {
  mode: "saved" | "onetime";
  templateName?: string;
  senderName?: string;
  senderCompany?: string;
  senderFax?: string;
  senderVoice?: string;
  receiverName?: string;
  receiverCompany?: string;
  subject?: string;
  message?: string;
}

interface FaxPreviewModalProps {
  open: boolean;
  onClose: () => void;
  files: File[];
  cover?: CoverPreviewInfo;
}

/** Renders an RTF-style cover page preview in HTML. */
function CoverPreview({ info, pageNum }: { info: CoverPreviewInfo; pageNum: number }) {
  const row = (label: string, value?: string) =>
    value ? (
      <tr>
        <td className="pr-4 py-1 text-xs font-semibold text-slate-500 whitespace-nowrap align-top">{label}</td>
        <td className="py-1 text-sm text-slate-800">{value}</td>
      </tr>
    ) : null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Page {pageNum}</span>
        <span className="text-xs text-slate-500">— Cover Page (RTF)</span>
        <span className="ml-auto text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
          generated server-side
        </span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-6 font-serif">
        {info.mode === "saved" ? (
          <div className="text-center py-10 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-3" />
            <p className="text-sm">
              Saved template: <span className="font-semibold text-slate-600">{info.templateName || "(none)"}</span>
            </p>
            <p className="text-xs mt-1">
              FaxBack fills in placeholder fields at send time — browser preview not available for saved templates.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <p className="text-lg font-bold tracking-wide">FAX COVER SHEET</p>
              <p className="text-xs text-slate-400">{new Date().toLocaleDateString()}</p>
            </div>
            <hr className="border-slate-300 mb-4" />
            <table className="w-full mb-4">
              <tbody>
                {row("To:", info.receiverName)}
                {row("Company:", info.receiverCompany)}
                {row("From:", info.senderName)}
                {row("Company:", info.senderCompany)}
                {row("Fax:", info.senderFax)}
                {row("Voice:", info.senderVoice)}
                {row("Subject:", info.subject)}
              </tbody>
            </table>
            {info.message && (
              <>
                <hr className="border-slate-200 mb-3" />
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{info.message}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sends the file through the server-side conversion pipeline and returns a
 * data URL the browser can display — identical to what FaxBack will receive.
 *
 * Images: PNG/JPEG/WEBP/BMP/GIF → grayscale TIFF → PNG for display
 * PDFs:   returned as-is (browser iframe)
 * Others: "unsupported" placeholder
 */
function FilePreview({ file, index }: { file: File; index: number }) {
  const [state, setState] = useState<"loading" | "image" | "pdf" | "unsupported" | "too_large" | "error">("loading");
  const [dataUrl, setDataUrl] = useState<string>();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const buffer = await file.arrayBuffer();
        const contentBase64 = Buffer.from(buffer).toString("base64");

        const res = await fetch("/api/fax/preview-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, contentBase64 }),
        });

        if (!res.ok) { setState("error"); return; }

        const json: { type: string; dataUrl: string | null } = await res.json();
        setDataUrl(json.dataUrl ?? undefined);
        setState(json.type as typeof state);
      } catch {
        setState("error");
      }
    })();
  }, [file]);

  const badge = (label: string, cls: string) => (
    <span className={`ml-auto text-[10px] border rounded px-1.5 py-0.5 shrink-0 ${cls}`}>{label}</span>
  );

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Page {index + 1}
        </span>
        <span className="text-xs text-slate-500 truncate">— {file.name}</span>
        {["png","jpg","jpeg","webp","bmp","gif"].includes(ext) &&
          badge("converted → TIFF", "bg-blue-50 text-blue-600 border-blue-200")}
        {["tif","tiff"].includes(ext) &&
          badge("TIFF", "bg-slate-50 text-slate-500 border-slate-200")}
        {ext === "pdf" &&
          badge("PDF", "bg-rose-50 text-rose-600 border-rose-200")}
        {["rtf","doc","docx"].includes(ext) &&
          badge("Word/RTF", "bg-blue-50 text-blue-600 border-blue-200")}
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white shadow-sm">
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-xs">Running conversion pipeline…</p>
          </div>
        )}

        {state === "image" && dataUrl && (
          <img
            src={dataUrl}
            alt={file.name}
            className="w-full object-contain"
            style={{ background: "#fff" }}
          />
        )}

        {state === "pdf" && dataUrl && (
          <iframe
            src={dataUrl}
            title={file.name}
            className="w-full"
            style={{ height: "70vh", border: "none" }}
          />
        )}

        {(state === "unsupported" || state === "too_large" || state === "error") && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            {["rtf","doc","docx"].includes(ext) ? (
              <FileText className="h-12 w-12" />
            ) : ["tif","tiff","dcx"].includes(ext) ? (
              <ImageIcon className="h-12 w-12" />
            ) : (
              <File className="h-12 w-12" />
            )}
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">{file.name}</p>
              <p className="text-xs text-slate-400 mt-1">
                {state === "too_large"
                  ? "File too large to preview"
                  : state === "error"
                  ? "Preview failed — file will still be sent"
                  : `${ext.toUpperCase()} files are rendered by FaxBack's server — no browser preview available`}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FaxPreviewModal({ open, onClose, files, cover }: FaxPreviewModalProps) {
  const totalPages = (cover ? 1 : 0) + files.length;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-base font-semibold">
            Fax Preview
            <span className="ml-2 text-sm font-normal text-slate-400">
              {totalPages} page{totalPages !== 1 ? "s" : ""} · sent in this order
            </span>
          </DialogTitle>
        </DialogHeader>

        {totalPages === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <File className="h-10 w-10 mb-3" />
            <p className="text-sm">No attachments or cover page added yet.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[80vh] px-6 py-5">
            {cover && <CoverPreview info={cover} pageNum={1} />}
            {files.map((file, i) => (
              <FilePreview key={i} file={file} index={cover ? i + 1 : i} />
            ))}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
