"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Image as ImageIcon, File, Loader2 } from "lucide-react";
import { generateCoverHtml, substitutePlaceholders } from "@/lib/covers/html-generator";
import mammoth from "mammoth";

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
  /** When a template is selected, its FIXED body text. $(Comments) and other
   *  $(Token) placeholders inside it are filled from the form fields + message. */
  templateBodyText?: string;
  /** Optional letterhead/logo from the saved template (preview only). */
  headerImageBase64?: string;
  headerImageType?: "png" | "jpeg";
}

interface FaxPreviewModalProps {
  open: boolean;
  onClose: () => void;
  files: File[];
  cover?: CoverPreviewInfo;
  /**
   * FaxBack resolution code: 0 = Standard (200×100), 2 = Fine (200×200),
   * 3 = Superfine (200×400). Used to degrade image previews so users see
   * approximately what the receiving machine will print.
   */
  resolution?: number;
}

/** Renders the cover page inside an iframe using the same HTML bytes sent to FaxBack. */
function CoverPreview({ info, pageNum, resolution }: { info: CoverPreviewInfo; pageNum: number; resolution: number }) {
  // Letter paper at 96 DPI; same approach as FilePreview.
  const PAPER_W = 816;
  const PAPER_H = 1056;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setScale(w / PAPER_W);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (info.mode === "saved") {
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Page {pageNum}</span>
          <span className="text-xs text-slate-500">— Cover Page (saved template)</span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden font-sans">
          <div className="text-center py-10 px-6 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-3" />
            <p className="text-sm">
              Saved template:{" "}
              <span className="font-semibold text-slate-600">{info.templateName || "(none)"}</span>
            </p>
            <p className="text-xs mt-1">
              FaxBack fills in placeholder fields at send time — browser preview not available for saved
              templates.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const fields = {
    senderName:      info.senderName      ?? "",
    senderCompany:   info.senderCompany   ?? "",
    senderFax:       info.senderFax       ?? "",
    senderVoice:     info.senderVoice     ?? "",
    receiverName:    info.receiverName    ?? "",
    receiverCompany: info.receiverCompany ?? "",
    subject:         info.subject         ?? "",
  };
  const comments = info.message ?? "";
  // Match server: when a template is selected, render its fixed body with
  // placeholders substituted; otherwise the comments textbox IS the body.
  const messageBody = info.templateBodyText
    ? substitutePlaceholders(info.templateBodyText, { ...fields, comments })
    : comments;

  const html = generateCoverHtml({
    ...fields,
    message: messageBody,
    headerImageBase64: info.headerImageBase64,
    headerImageType:   info.headerImageType,
  });

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Page {pageNum}</span>
        <span className="text-xs text-slate-500">— Cover Page (HTML)</span>
        <span className="ml-auto text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 shrink-0">
          exact bytes sent
        </span>
      </div>
      <div ref={wrapRef} className="rounded-lg border border-slate-200 overflow-hidden bg-[#c8c8c8]" style={{ padding: "14px 10px" }}>
        <div style={{ background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.22)", margin: "0 auto", width: "100%", height: PAPER_H * scale, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: PAPER_W, height: PAPER_H, transform: `scale(${scale})`, transformOrigin: "top left", filter: "grayscale(100%)" }}>
            <iframe
              srcDoc={html}
              title="Cover Page preview"
              sandbox=""
              scrolling="no"
              style={{ width: PAPER_W, height: PAPER_H, border: "none", display: "block" }}
            />
          </div>
        </div>
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
function FilePreview({ file, index, resolution }: { file: File; index: number; resolution: number }) {
  const [state, setState] = useState<"loading" | "image" | "pdf" | "html" | "txt" | "docx" | "doc" | "unsupported" | "too_large" | "error">("loading");
  const [dataUrl, setDataUrl] = useState<string>();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        // DOCX: convert to HTML via mammoth (client-side)
        if (ext === "docx") {
          const arrayBuf = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuf });
          setDataUrl(result.value);
          setState("docx");
          return;
        }
        // DOC (old binary format): no pure-JS parser available
        if (ext === "doc") {
          setState("doc");
          return;
        }
        // HTML and TXT render client-side — no server round-trip needed
        if (["html", "htm"].includes(ext)) {
          const text = await file.text();
          // FaxBack's renderer does not support base64 PNG/JPEG data URIs.
          // Replace them with a blank placeholder so the preview matches reality.
          const sanitized = text.replace(
            /src\s*=\s*(["'])data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[^"']*\1/gi,
            'src="" data-fax-stripped="1"'
          );
          setDataUrl(sanitized);
          setState("html");
          return;
        }
        if (ext === "txt") {
          const text = await file.text();
          setDataUrl(text);
          setState("txt");
          return;
        }

        const buffer = await file.arrayBuffer();
        const contentBase64 = Buffer.from(buffer).toString("base64");

        const res = await fetch("/api/fax/preview-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, contentBase64, resolution }),
        });

        if (!res.ok) { setState("error"); return; }

        const json: { type: string; dataUrl: string | null } = await res.json();

        // PDFs: convert the server-returned data URL into a blob: URL.
        // Chrome's PDF viewer in iframes is unreliable with large data:
        // URLs (silently renders blank, no console error). blob: URLs
        // work consistently. The bytes are identical — just wrapped.
        if (json.type === "pdf" && json.dataUrl) {
          const base64 = json.dataUrl.split(",")[1] ?? "";
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          setDataUrl(blobUrl);
          setState("pdf");
          return;
        }

        setDataUrl(json.dataUrl ?? undefined);
        setState(json.type as typeof state);
      } catch {
        setState("error");
      }
    })();

    // Revoke any blob: URL we created when this preview unmounts
    return () => {
      if (dataUrl?.startsWith("blob:")) URL.revokeObjectURL(dataUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const badge = (label: string, cls: string) => (
    <span className={`ml-auto text-[10px] border rounded px-1.5 py-0.5 shrink-0 ${cls}`}>{label}</span>
  );

  // Non-image previews (PDF/HTML/DOCX/TXT) render inside their own iframe
  // viewport, so we can only apply visual effects at the iframe level — that
  // doesn't faithfully simulate Standard-resolution degradation. We just show
  // grayscale for the fax-machine look; resolution-specific degradation is
  // applied server-side at pixel level for raster images only.
  const stdFilter = "grayscale(100%)";

  // Letter paper at 96 DPI = 816×1056 px. Rendering each preview at this
  // native size and scaling via CSS transform keeps the doc visually at real
  // 8.5×11" proportions regardless of modal column width.
  const PAPER_W = 816;
  const PAPER_H = 1056;

  // Track wrapper width to compute the transform scale dynamically.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setScale(w / PAPER_W);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [state]);

  /** Renders children inside a scaled letter-paper box so the SVG blur and
   *  on-screen size match real 8.5×11" output. */
  const PaperBox = ({ children }: { children: React.ReactNode }) => (
    <div ref={wrapRef} className="w-full bg-[#c8c8c8]" style={{ padding: "14px 10px" }}>
      <div
        style={{
          width: "100%",
          height: PAPER_H * scale,
          position: "relative",
          margin: "0 auto",
          boxShadow: "0 2px 10px rgba(0,0,0,0.22)",
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: PAPER_W,
            height: PAPER_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            filter: stdFilter,
          }}
        >
          {children}
        </div>
      </div>
    </div>
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
        {ext === "docx" &&
          badge("DOCX preview", "bg-indigo-50 text-indigo-600 border-indigo-200")}
        {ext === "doc" &&
          badge("DOC — no preview", "bg-red-50 text-red-500 border-red-200")}
        {ext === "rtf" &&
          badge("RTF — no preview", "bg-slate-50 text-slate-500 border-slate-200")}
        {["html","htm"].includes(ext) &&
          badge("HTML", "bg-orange-50 text-orange-600 border-orange-200")}
        {ext === "txt" &&
          badge("TXT", "bg-slate-50 text-slate-500 border-slate-200")}
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
          <div className="w-full bg-[#c8c8c8]" style={{ padding: "14px 10px" }}>
            <div style={{ background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,0.22)", margin: "0 auto", aspectRatio: "8.5 / 11", overflow: "hidden" }}>
              <iframe
                src={`${dataUrl}#view=FitH&zoom=page-width`}
                title={file.name}
                style={{ width: "100%", height: "100%", border: "none", display: "block", filter: "grayscale(100%)" }}
              />
            </div>
          </div>
        )}

        {state === "html" && dataUrl && (
          <>
            <PaperBox>
              <iframe
                srcDoc={dataUrl}
                title={file.name}
                sandbox=""
                style={{ width: PAPER_W, height: PAPER_H, border: "none" }}
              />
            </PaperBox>
            <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800 space-y-0.5">
              <p className="font-semibold">HTML preview limitations — the fax may differ:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Inline base64 PNG/JPEG images are <strong>not rendered</strong> by FaxBack (shown blank above)</li>
                <li>Some external HTTPS images may be blocked by FaxBack&apos;s fetcher</li>
                <li>Emoji are dropped — use text or hosted images instead</li>
                <li>Layout is rendered by FaxBack&apos;s server renderer, which may differ from your browser</li>
                <li>For a faithful preview, export the file as PDF before sending</li>
              </ul>
            </div>
          </>
        )}

        {state === "txt" && dataUrl && (
          <PaperBox>
            <pre style={{ width: PAPER_W, height: PAPER_H, margin: 0, padding: "1in", fontSize: "11pt", color: "#000", whiteSpace: "pre-wrap", wordBreak: "break-word", overflow: "auto", boxSizing: "border-box", background: "#fff" }}>
              {dataUrl}
            </pre>
          </PaperBox>
        )}

        {state === "docx" && dataUrl && (
          <>
            <PaperBox>
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;margin:1in;color:#000}img{max-width:100%}</style></head><body>${dataUrl}</body></html>`}
                title={file.name}
                sandbox=""
                style={{ width: PAPER_W, height: PAPER_H, border: "none" }}
              />
            </PaperBox>
            <div className="px-3 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800 space-y-0.5">
              <p className="font-semibold">Approximate preview — the fax may differ:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>FaxBack renders the file with its own Word engine — layout, fonts, and spacing may differ</li>
                <li>Images are shown here but their size/position in the fax depends on Word&apos;s layout engine</li>
                <li>Headers, footers, text boxes, and floating objects may not appear above</li>
                <li>For an accurate preview, save as PDF and attach that instead</li>
              </ul>
            </div>
          </>
        )}

        {state === "doc" && (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-slate-400 gap-3">
            <FileText className="h-12 w-12" />
            <div className="text-center max-w-xs">
              <p className="text-sm font-medium text-slate-600">{file.name}</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Old-format <strong>.doc</strong> files cannot be previewed in the browser.
                The file will be sent and rendered by FaxBack&apos;s Word engine.
              </p>
              <p className="text-xs text-amber-600 mt-2 font-medium">
                For an accurate preview, open in Word and save as PDF or DOCX first.
              </p>
            </div>
          </div>
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

export function FaxPreviewModal({ open, onClose, files, cover, resolution = 2 }: FaxPreviewModalProps) {
  const totalPages = (cover ? 1 : 0) + files.length;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="sm:max-w-[35vw] w-full p-0 gap-0"
        // Tell browser extensions (Grammarly etc.) to skip this subtree.
        // Grammarly attaches `unload` listeners that violate Permissions-Policy
        // and produce console noise on every React unmount inside the modal.
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle className="text-base font-semibold flex items-center gap-2 flex-wrap">
            Fax Preview
            <span className="text-sm font-normal text-slate-400">
              {totalPages} page{totalPages !== 1 ? "s" : ""} · sent in this order
            </span>
            <span
              className={`ml-auto text-[10px] border rounded px-1.5 py-0.5 shrink-0 ${
                resolution === 0
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : resolution === 3
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
              }`}
              title="Resolution affects the receiving fax machine's vertical print density"
            >
              {resolution === 0
                ? "Standard (200×100 DPI)"
                : resolution === 3
                  ? "Superfine (200×400 DPI)"
                  : "Fine (200×200 DPI)"}
            </span>
          </DialogTitle>
        </DialogHeader>

        {totalPages === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <File className="h-10 w-10 mb-3" />
            <p className="text-sm">No attachments or cover page added yet.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[88vh] px-6 py-5">
            {cover && <CoverPreview info={cover} pageNum={1} />}
            {files.map((file, i) => (
              <FilePreview key={i} file={file} index={cover ? i + 1 : i} resolution={resolution} />
            ))}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
