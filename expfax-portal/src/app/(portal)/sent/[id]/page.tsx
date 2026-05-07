"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, RefreshCcw, Phone, Clock, Zap, RotateCcw, FileText, Loader2 } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sent")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Sent
        </Button>
        {fax.status === "failed" && (
          <Button variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-1" /> Resend
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PDF viewer */}
        <div className="lg:col-span-2">
          <Card className="h-[700px]">
            <CardContent className="p-0 h-full">
              {pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-full rounded-xl" title="Fax viewer" />
              ) : (
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
              )}
            </CardContent>
          </Card>
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
              <div><span className="text-slate-400">To:</span>
                <span className="ml-2 font-medium">
                  {fax.recipients?.[0]
                    ? (fax.recipients[0].name
                        ? `${fax.recipients[0].name} · ${fax.recipients[0].faxNumber}`
                        : fax.recipients[0].faxNumber)
                    : "—"}
                  {fax.recipients.length > 1 && (
                    <span className="text-slate-400 ml-1">+{fax.recipients.length - 1} more</span>
                  )}
                </span>
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
        {fax.recipients.map((r, i) => (
          <Card key={r.recipientGuid || i}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold">{r.name || r.faxNumber}</p>
                  {r.name && <p className="text-sm text-slate-400 font-mono">{r.faxNumber}</p>}
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
        ))}
      </div>
    </div>
  );
}
