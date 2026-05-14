"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, RefreshCcw, Phone, Clock, Zap, RotateCcw, FileText, Loader2 } from "lucide-react";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { useContactNames } from "@/lib/contacts/use-contact-names";

interface RecipientDetail {
  recipientGuid: string;
  name: string;
  faxNumber: string;
  status: string;
  error: string;
  errorNumber: number;
  dialSeconds: number;
  connectSeconds: number;
  totalSeconds: number;
  pageCount: number;
  pagesTransferred: number;
  connectBps: number;
  retries: number;
  localCsid: string;
  remoteCsid: string;
}

interface SentFaxDetail {
  id: string;
  subject: string;
  status: string;
  submitTime: string;
  scheduleTime: string | null;
  coverTemplate: string;
  billingCode: string;
  resolution: number;
  senderName: string;
  senderFaxNumber: string;
  recipients: RecipientDetail[];
  documents: Array<{ name: string; pageCount: number }>;
  faxImagePath: string;
  sentDocumentPaths: string[];
}

export default function SentDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const backTo = searchParams.get("from") === "history" ? "/history" : "/sent";
  const backLabel = searchParams.get("from") === "history" ? "Back to History" : "Back to Sent";
  const [fax, setFax] = useState<SentFaxDetail | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(true);

  const fetchFax = useCallback(() => {
    fetch(`/api/fax/${id}`).then((r) => r.json()).then(setFax);
  }, [id]);

  const fetchPdfUrl = useCallback(() => {
    setPdfLoading(true);
    fetch(`/api/fax/${id}/view-url`)
      .then((r) => r.json())
      .then((data) => { if (data.url) setPdfUrl(data.url); })
      .finally(() => setPdfLoading(false));
  }, [id]);

  useEffect(() => {
    fetchFax();
    fetchPdfUrl();
  }, [fetchFax, fetchPdfUrl]);

  // Auto-refresh while fax is in-progress or the rendered PDF isn't ready yet
  useEffect(() => {
    if (!fax || pdfUrl) return;
    const isPending = fax.status === "queued" || fax.status === "sending" ||
      (fax.status === "sent" && !pdfUrl && !pdfLoading);
    if (!isPending) return;
    const timer = setTimeout(() => { fetchFax(); fetchPdfUrl(); }, 10_000);
    return () => clearTimeout(timer);
  }, [fax, pdfUrl, pdfLoading, fetchFax, fetchPdfUrl]);

  // Batch-resolve contact names for all recipients (works before fax loads — hook returns {} when numbers is [])
  const recipientNumbers = useMemo(
    () => (fax?.recipients ?? []).map((r) => r.faxNumber).filter(Boolean),
    [fax]
  );
  const contactNames = useContactNames(recipientNumbers);

  if (!fax) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  const statusColor: Record<string, string> = {
    sent: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    sending: "bg-amber-50 text-amber-700",
    queued: "bg-slate-100 text-slate-700",
  };

  const docPageTotal = fax.documents.reduce((s, d) => s + d.pageCount, 0);
  const totalPages = docPageTotal || fax.recipients?.[0]?.pageCount || 0;
  const isPending = fax.status === "queued" || fax.status === "sending";

  // Viewer mode: final rendered PDF, original docs preview, or placeholder
  const hasFinalPdf = !!fax.faxImagePath && !!pdfUrl;
  const sentDocs: string[] = Array.isArray(fax.sentDocumentPaths) ? fax.sentDocumentPaths : [];
  const hasSentDocs = sentDocs.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backTo)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {backLabel}
        </Button>
        {fax.status === "failed" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/send?resendFrom=${id}`)}
          >
            <RefreshCcw className="h-4 w-4 mr-1" /> Send Again
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Viewer */}
        <div className="lg:col-span-2">
          {hasFinalPdf ? (
            /* ── Final rendered fax PDF ── */
            <Card className="h-[700px]">
              <CardContent className="p-0 h-full">
                <iframe src={pdfUrl!} className="w-full h-full rounded-xl" title="Fax viewer" />
              </CardContent>
            </Card>
          ) : hasSentDocs ? (
            /* ── Original documents while final PDF not ready ── */
            <div className="space-y-4">
              {/* Status banner */}
              <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
                fax.status === "failed"
                  ? "bg-red-50 border border-red-200 text-red-700"
                  : fax.status === "queued"
                  ? "bg-slate-100 border border-slate-200 text-slate-600"
                  : "bg-amber-50 border border-amber-200 text-amber-700"
              }`}>
                {(isPending || (fax.status === "sent" && !pdfUrl && !pdfLoading)) && (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                )}
                {fax.status === "queued" && "Fax is queued — showing uploaded files below."}
                {fax.status === "sending" && "Fax is transmitting — showing uploaded files below."}
                {fax.status === "failed" && "Transmission failed — uploaded files are preserved below."}
                {fax.status === "sent" && !pdfUrl && "Final fax PDF is being prepared — showing uploaded files below."}
                {(isPending || (fax.status === "sent" && !pdfUrl)) && (
                  <span className="ml-auto text-xs opacity-70 shrink-0">Refreshing…</span>
                )}
              </div>

              {/* One card per document */}
              {sentDocs.map((blobPath, i) => {
                const ext = blobPath.split(".").pop()?.toLowerCase() ?? "";
                const isPdf = ext === "pdf";
                const isTiff = ext === "tiff" || ext === "tif";
                const docName = fax.documents[i]?.name ?? blobPath.split("/").pop()?.replace(/^\d+_/, "") ?? `Document ${i + 1}`;
                return (
                  <Card key={i}>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" />
                        {docName}
                        {isPdf && <span className="ml-auto text-[10px] font-medium bg-rose-50 text-rose-600 border border-rose-200 rounded px-1.5 py-0.5 normal-case tracking-normal">PDF</span>}
                        {isTiff && <span className="ml-auto text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 normal-case tracking-normal">converted → TIFF</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-hidden rounded-b-xl">
                      {isPdf ? (
                        <iframe
                          src={`/api/fax/${id}/download?sentdoc=${i}&inline=1`}
                          className="w-full"
                          style={{ height: "65vh", border: "none" }}
                          title={docName}
                        />
                      ) : isTiff ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/fax/${id}/download?sentdoc=${i}&inline=1&preview=1`}
                          alt={docName}
                          className="w-full object-contain"
                          style={{ background: "#fff" }}
                        />
                      ) : (
                        <div className="py-10 text-center text-slate-400 text-sm">
                          <FileText className="h-8 w-8 mx-auto mb-2" />
                          No browser preview available for this file type
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            /* ── No preview available ── */
            <Card className="h-[700px]">
              <CardContent className="p-0 h-full">
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                  {isPending || pdfLoading ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : (
                    <FileText className="h-12 w-12" />
                  )}
                  <p className="text-sm">
                    {fax.status === "queued" ? "Fax is queued for transmission…" :
                     fax.status === "sending" ? "Fax is being transmitted…" :
                     fax.status === "failed" ? "No preview — transmission failed." :
                     "Fax PDF is being prepared…"}
                  </p>
                  {(isPending || (fax.status === "sent" && !pdfUrl)) && (
                    <p className="text-xs text-slate-300">Refreshing automatically</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Metadata sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Transmission Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-slate-400">Status:</span>
                <Badge className={`ml-2 text-[10px] ${statusColor[fax.status] || ""}`}>{fax.status}</Badge>
              </div>
              <div>
                <span className="text-slate-400">To:</span>
                {fax.recipients.length === 0 ? (
                  <span className="ml-2 font-medium">—</span>
                ) : fax.recipients.length === 1 ? (
                  <span className="ml-2 font-medium">
                    {(() => {
                      const r = fax.recipients[0];
                      const cn = contactNames[normalizePhone(r.faxNumber)]?.name;
                      const name = cn || r.name || "";
                      return name
                        ? <>{name} <span className="text-slate-500 font-mono font-normal">· {formatPhone(r.faxNumber)}</span></>
                        : <span className="font-mono">{formatPhone(r.faxNumber)}</span>;
                    })()}
                  </span>
                ) : (
                  <ul className="ml-2 mt-1 space-y-0.5 font-medium">
                    {fax.recipients.map((r, i) => {
                      const cn = contactNames[normalizePhone(r.faxNumber)]?.name;
                      const name = cn || r.name || "";
                      return (
                        <li key={r.recipientGuid || i} className="text-sm">
                          {name ? (
                            <>{name} <span className="text-slate-500 font-mono font-normal">· {formatPhone(r.faxNumber)}</span></>
                          ) : (
                            <span className="font-mono font-normal">{formatPhone(r.faxNumber)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div><span className="text-slate-400">Subject:</span> <span className="ml-2">{fax.subject || "—"}</span></div>
              <div><span className="text-slate-400">Submitted:</span> <span className="ml-2">{new Date(fax.submitTime).toLocaleString()}</span></div>
              <div><span className="text-slate-400">Pages:</span> <span className="ml-2">{totalPages || "—"}</span></div>
              {fax.billingCode && (
                <div><span className="text-slate-400">Billing Code:</span> <span className="ml-2">{fax.billingCode}</span></div>
              )}
            </CardContent>
          </Card>

          {fax.faxImagePath && (
            <a
              href={`/api/fax/${id}/download`}
              download
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
            >
              <Download className="h-4 w-4" /> Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Per-recipient details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">Recipients ({fax.recipients.length})</h3>
        {fax.recipients.map((r, i) => {
          const cn = contactNames[normalizePhone(r.faxNumber)]?.name;
          const recipName = cn || r.name || "";
          return (
          <Card key={r.recipientGuid || i}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold">{recipName || formatPhone(r.faxNumber)}</p>
                  {recipName && <p className="text-sm text-slate-400 font-mono">{formatPhone(r.faxNumber)}</p>}
                </div>
                <Badge className={`text-[10px] ${r.error ? statusColor.failed : r.pagesTransferred > 0 ? statusColor.sent : statusColor.queued}`}>
                  {r.error ? "Failed" : r.pagesTransferred > 0 ? "Delivered" : "Pending"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <Phone className="h-3.5 w-3.5" />
                  <span>Dial: {r.dialSeconds}s</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Total: {r.totalSeconds}s</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Zap className="h-3.5 w-3.5" />
                  <span>{r.connectBps} bps</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retries: {r.retries}</span>
                </div>
              </div>

              <div className="mt-3 text-sm text-slate-500">
                Pages: {r.pagesTransferred} / {r.pageCount} transferred
                {r.remoteCsid && <span className="ml-4">CSID: {r.remoteCsid}</span>}
              </div>

              {r.error && (
                <div className="mt-3 bg-red-50 text-red-700 text-sm rounded-lg p-3">
                  Error {r.errorNumber}: {r.error}
                </div>
              )}
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
