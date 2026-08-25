import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { TableSkeleton, ErrorState } from "@/components/states";
import { useToast } from "@/components/ui/toast";
import { api, apiConfigured, getAccessToken } from "@/lib/api";
import { db } from "@/lib/db";
import type { Report } from "@/lib/types";

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ pdfRef: string | null; status: string } | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      if (apiConfigured()) {
        const r = await api.getReport(id);
        setReport({
          id: r.id,
          org_id: r.tenantId,
          type: r.type,
          period_start: r.periodStart,
          period_end: r.periodEnd,
          content_md: r.contentMd,
          content_json: {},
          recipient_ids: [],
          sent_at: null,
          created_at: r.createdAt,
        });
        setPdfMeta({ pdfRef: r.pdfRef, status: r.status });
      } else {
        const r = await db.getReport(id);
        if (!r) setError(true);
        else {
          setReport(r);
          setPdfMeta(null);
        }
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function downloadPdf() {
    if (!id || !apiConfigured()) {
      window.print();
      return;
    }
    try {
      const token = getAccessToken();
      const res = await fetch(api.reportPdfUrl(id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loop-report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast("PDF downloaded.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF not ready.", "error");
    }
  }

  async function regenerate() {
    if (!apiConfigured()) return;
    try {
      await api.generateReport();
      toast("Report generated.", "success");
      await load();
    } catch {
      toast("Could not generate report.", "error");
    }
  }

  if (loading) return <TableSkeleton />;
  if (error || !report) return <ErrorState onRetry={load} />;

  return (
    <div className="portal-page animate-fade-in">
      <button onClick={() => navigate("/reports")} className="inline-flex items-center gap-1 text-sm text-slate hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Reports
      </button>

      <PageHeader
        title={report.type === "daily" ? "Daily report" : "Weekly report"}
        actions={
          <div className="flex flex-wrap gap-2">
            {apiConfigured() ? (
              <Button variant="outline" onClick={() => void regenerate()}>
                <FileText className="h-4 w-4" /> Generate new
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void downloadPdf()}>
              <Download className="h-4 w-4" />{" "}
              {apiConfigured() && pdfMeta?.pdfRef ? "Download PDF" : "Print"}
            </Button>
          </div>
        }
      />

      {pdfMeta ? (
        <p className="text-xs text-slate">
          PDF status: <span className="font-mono">{pdfMeta.status}</span>
          {pdfMeta.pdfRef ? " · ready" : " · not stored yet"}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-6">
          <Markdown source={report.content_md} />
          <p className="mt-8 border-t border-[rgba(14,31,26,0.1)] pt-4 text-[11px] font-medium leading-relaxed text-[#5A6B7D]">
            This report describes the status of work items and projects. It is not a measure of individual performance
            and must not be used as the basis for promotion, discipline, or termination decisions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
