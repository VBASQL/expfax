"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, FileText } from "lucide-react";

interface FaxDetail {
  id: string;
  senderName: string;
  senderFaxNumber: string;
  senderCompany: string;
  subject: string;
  status: string;
  submitTime: string;
  documents: Array<{ name: string; pageCount: number }>;
  recipients: Array<{ name: string; faxNumber: string }>;
  faxImagePath: string;
}

export default function InboxDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [fax, setFax] = useState<FaxDetail | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/fax/${id}`).then((r) => r.json()).then((data) => {
      setFax(data);
      // Mark as read
      fetch(`/api/fax/${id}/read`, { method: "POST" });
    });
    fetch(`/api/fax/${id}/view-url`).then((r) => r.json()).then((data) => {
      if (data.url) setPdfUrl(data.url);
    });
  }, [id]);

  if (!fax) return <p className="text-sm text-slate-400 p-8">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/inbox")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Inbox
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PDF Viewer */}
        <div className="lg:col-span-2">
          <Card className="h-[700px]">
            <CardContent className="p-0 h-full">
              {pdfUrl ? (
                <iframe src={pdfUrl} className="w-full h-full rounded-xl" title="Fax viewer" />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <FileText className="h-12 w-12" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Metadata */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fax Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-slate-400">From:</span> <span className="font-medium ml-2">{fax.senderFaxNumber || fax.senderName}</span></div>
              <div><span className="text-slate-400">Company:</span> <span className="ml-2">{fax.senderCompany || "—"}</span></div>
              <div><span className="text-slate-400">Subject:</span> <span className="ml-2">{fax.subject || "—"}</span></div>
              <div><span className="text-slate-400">Status:</span> <Badge variant="secondary" className="ml-2 text-[10px]">{fax.status}</Badge></div>
              <div><span className="text-slate-400">Received:</span> <span className="ml-2">{new Date(fax.submitTime).toLocaleString()}</span></div>
              <div><span className="text-slate-400">Pages:</span> <span className="ml-2">{fax.documents?.reduce((s, d) => s + d.pageCount, 0) || "—"}</span></div>
            </CardContent>
          </Card>

          <a
            href={`/api/fax/${id}/download`}
            download
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            <Download className="h-4 w-4" /> Download PDF
          </a>
        </div>
      </div>
    </div>
  );
}
