import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CmykGroup } from "@/components/CmykBar";
import { Sparkles, Printer, AlertCircle, Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";

const CMYK_COLORS = ["#06b6d4", "#ec4899", "#eab308", "#374151"];

export default function SharedResult() {
  const { token } = useParams<{ token: string }>();
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data, isLoading, error } = trpc.analysis.getByShareToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  // Resolve sessionId from the shared session so we can call exportPdf
  const exportPdfByToken = trpc.analysis.exportPdfByShareToken.useMutation();

  const handleDownloadPdf = async () => {
    if (!token) return;
    setPdfLoading(true);
    try {
      const result = await exportPdfByToken.mutateAsync({ token });
      if (result.isDataUrl) {
        const byteStr = atob(result.url.split(",")[1]);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ink-coverage-report-shared.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        const resp = await fetch(result.url);
        const blob = await resp.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ink-coverage-report-shared.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      toast.success("PDF report downloaded!");
    } catch (err: any) {
      toast.error(err.message || "PDF export failed");
    } finally {
      setPdfLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Loading shared results…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="py-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <p className="font-semibold">Results Not Found</p>
            <p className="text-sm text-muted-foreground">
              This shared link may have expired (results are deleted after 24 hours) or the link is invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { session, files, pages, aiSummary } = data;

  const avgCoverage = pages.length > 0 ? {
    c: pages.reduce((s, p) => s + (p.cCoverage ?? 0), 0) / pages.length,
    m: pages.reduce((s, p) => s + (p.mCoverage ?? 0), 0) / pages.length,
    y: pages.reduce((s, p) => s + (p.yCoverage ?? 0), 0) / pages.length,
    k: pages.reduce((s, p) => s + (p.kCoverage ?? 0), 0) / pages.length,
    tac: pages.reduce((s, p) => s + (p.tac ?? 0), 0) / pages.length,
  } : null;

  const chartData = pages.map((p) => ({
    name: `P${p.pageNumber}`,
    C: +(p.cCoverage ?? 0).toFixed(2),
    M: +(p.mCoverage ?? 0).toFixed(2),
    Y: +(p.yCoverage ?? 0).toFixed(2),
    K: +(p.kCoverage ?? 0).toFixed(2),
  }));

  const pieData = avgCoverage ? [
    { name: "Cyan",    value: +avgCoverage.c.toFixed(2) },
    { name: "Magenta", value: +avgCoverage.m.toFixed(2) },
    { name: "Yellow",  value: +avgCoverage.y.toFixed(2) },
    { name: "Black",   value: +avgCoverage.k.toFixed(2) },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Printer className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>InkCalc</h1>
            <p className="text-xs text-muted-foreground">Shared Analysis Results</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">
              Shared · Expires {new Date(session.expiresAt).toLocaleDateString()}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
            >
              {pdfLoading ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-1.5" />
              )}
              Download PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Ink Coverage Report</h2>
          <p className="text-muted-foreground">
            {files.length} file{files.length !== 1 ? "s" : ""} · {pages.length} page{pages.length !== 1 ? "s" : ""} analyzed
          </p>
        </div>

        {/* Average coverage */}
        {avgCoverage && (
          <Card className="max-w-md mx-auto">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Average CMYK Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <CmykGroup c={avgCoverage.c} m={avgCoverage.m} y={avgCoverage.y} k={avgCoverage.k} tac={avgCoverage.tac} />
            </CardContent>
          </Card>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Per-Page Coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => `${v.toFixed(2)}%`} />
                  <Bar dataKey="C" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="M" fill="#ec4899" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Y" fill="#eab308" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="K" fill="#374151" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Channel Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={CMYK_COLORS[i]} />)}
                    </Pie>
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No ink coverage detected</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Per-page table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Per-Page Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">File</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground">Page</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-cyan-600">C%</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-pink-600">M%</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-yellow-600">Y%</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-700">K%</th>
                  <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground">TAC%</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p, i) => {
                  const file = files.find((f) => f.id === p.fileId);
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-2 text-xs text-muted-foreground max-w-[120px] truncate">{file?.filename ?? `File ${p.fileId}`}</td>
                      <td className="py-2 px-2 text-right font-mono">{p.pageNumber}</td>
                      <td className="py-2 px-2 text-right font-mono text-cyan-600">{(p.cCoverage ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono text-pink-600">{(p.mCoverage ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono text-yellow-600">{(p.yCoverage ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono text-gray-700">{(p.kCoverage ?? 0).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono font-semibold">{(p.tac ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* AI Summary */}
        {aiSummary && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">AI Analysis & Recommendations</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-foreground leading-relaxed">{aiSummary.summary}</p>
              {Array.isArray(aiSummary.recommendations) && aiSummary.recommendations.length > 0 && (
                <ul className="space-y-2">
                  {(aiSummary.recommendations as string[]).map((rec, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold">{i + 1}</span>
                      <span className="text-muted-foreground">{rec}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Download CTA at bottom */}
        <div className="flex justify-center pt-4">
          <Button
            size="lg"
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50 gap-2"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
          >
            {pdfLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileDown className="w-5 h-5" />
            )}
            {pdfLoading ? "Generating PDF…" : "Download Full PDF Report"}
          </Button>
        </div>
      </main>

      <footer className="border-t border-border mt-16 py-8">
        <div className="container text-center">
          <p className="text-xs text-muted-foreground">
            InkCalc — Ink Coverage & Print Cost Calculator &nbsp;·&nbsp;
            <a href="https://www.sctdjm.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-2">
              sctdjm.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
