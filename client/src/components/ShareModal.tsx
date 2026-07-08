import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy, ExternalLink, Download, Share2, Loader2, CheckCircle2, CloudUpload
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  shareUrl: string | null;
  shareToken: string | null;
  onGetPdfBlob: () => Promise<Blob | null>;
  sessionId: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNativeShareSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.share;
}

function isFileShareSupported(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.canShare &&
      navigator.canShare({ files: [new File([""], "test.pdf", { type: "application/pdf" })] })
    );
  } catch {
    return false;
  }
}

// ─── Share Apps Config ───────────────────────────────────────────────────────

type AppAction = "open_url" | "download_then_upload" | "download_pdf";

interface ShareApp {
  id: string;
  label: string;
  color: string;
  icon: string;
  action: AppAction;
  /** For action=open_url: returns the URL to open */
  getUrl?: (url: string, text: string) => string;
  /** For action=download_then_upload: the service URL to open after download */
  uploadUrl?: string;
  uploadHint?: string;
}

const SHARE_APPS: ShareApp[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "#25D366",
    icon: "💬",
    action: "open_url",
    getUrl: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "#2CA5E0",
    icon: "✈️",
    action: "open_url",
    getUrl: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "gmail",
    label: "Gmail",
    color: "#EA4335",
    icon: "✉️",
    action: "open_url",
    getUrl: (url, text) =>
      `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent("Ink Coverage Report")}&body=${encodeURIComponent(text + "\n\n" + url)}`,
  },
  {
    id: "outlook",
    label: "Outlook",
    color: "#0078D4",
    icon: "📧",
    action: "open_url",
    getUrl: (url, text) =>
      `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent("Ink Coverage Report")}&body=${encodeURIComponent(text + "\n\n" + url)}`,
  },
  {
    id: "teams",
    label: "Teams",
    color: "#6264A7",
    icon: "👥",
    action: "open_url",
    // Teams share dialog — works for web links
    getUrl: (url, text) =>
      `https://teams.microsoft.com/share?href=${encodeURIComponent(url)}&msgText=${encodeURIComponent(text)}`,
  },
  {
    id: "onedrive",
    label: "OneDrive",
    color: "#0078D4",
    icon: "☁️",
    action: "download_then_upload",
    uploadUrl: "https://onedrive.live.com/upload",
    uploadHint: "PDF saved to Downloads — open OneDrive and tap Upload to add it.",
  },
  {
    id: "dropbox",
    label: "Dropbox",
    color: "#0061FF",
    icon: "📦",
    action: "download_then_upload",
    uploadUrl: "https://www.dropbox.com/upload",
    uploadHint: "PDF saved to Downloads — open Dropbox and tap Upload to add it.",
  },
  {
    id: "email",
    label: "Email",
    color: "#6B7280",
    icon: "📨",
    action: "open_url",
    getUrl: (url, text) =>
      `mailto:?subject=${encodeURIComponent("Ink Coverage Report")}&body=${encodeURIComponent(text + "\n\n" + url)}`,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ShareModal({
  open,
  onClose,
  shareUrl,
  shareToken,
  onGetPdfBlob,
  sessionId,
}: ShareModalProps) {
  const [pdfLoading, setPdfLoading] = useState<string | null>(null); // stores app id or "native" or "download"
  const [copied, setCopied] = useState(false);

  const linkUrl = shareUrl ?? (shareToken ? `${window.location.origin}/share/${shareToken}` : null);
  const shareText = "Check out my ink coverage analysis report from InkCalc!";

  // ── Download PDF helper ───────────────────────────────────────────────────
  const downloadPdf = async (): Promise<boolean> => {
    const blob = await onGetPdfBlob();
    if (!blob) return false;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ink-coverage-report.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    return true;
  };

  // ── Native Share (Android / iOS) ──────────────────────────────────────────
  const handleNativeShare = async () => {
    if (!isNativeShareSupported()) return;
    setPdfLoading("native");

    // Try to share the PDF file directly if supported
    if (isFileShareSupported() && sessionId) {
      try {
        const blob = await onGetPdfBlob();
        if (blob) {
          const file = new File([blob], "ink-coverage-report.pdf", { type: "application/pdf" });
          await navigator.share({
            title: "Ink Coverage Report",
            text: shareText,
            files: [file],
            ...(linkUrl ? { url: linkUrl } : {}),
          });
          toast.success("Shared successfully!");
          setPdfLoading(null);
          onClose();
          return;
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          setPdfLoading(null);
          return;
        }
        // Fall through to URL-only share
      }
    }

    // Fallback: share URL only
    if (linkUrl) {
      try {
        await navigator.share({
          title: "Ink Coverage Report",
          text: shareText,
          url: linkUrl,
        });
        toast.success("Shared successfully!");
        onClose();
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          toast.error("Share failed. Try copying the link instead.");
        }
      }
    } else {
      // No link — try to share PDF file only
      try {
        const blob = await onGetPdfBlob();
        if (blob) {
          const file = new File([blob], "ink-coverage-report.pdf", { type: "application/pdf" });
          await navigator.share({
            title: "Ink Coverage Report",
            text: shareText,
            files: [file],
          });
          toast.success("Shared successfully!");
          onClose();
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          toast.error("Share failed. Try downloading the PDF instead.");
        }
      }
    }
    setPdfLoading(null);
  };

  // ── Copy Link ─────────────────────────────────────────────────────────────
  const handleCopyLink = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  // ── App Share ─────────────────────────────────────────────────────────────
  const handleAppShare = async (app: ShareApp) => {
    if (app.action === "open_url") {
      // For URL-based apps, we need a link
      if (!linkUrl) {
        // No link (private mode) — for messaging apps, try native share with PDF
        if (isNativeShareSupported() && isFileShareSupported()) {
          setPdfLoading(app.id);
          try {
            const blob = await onGetPdfBlob();
            if (blob) {
              const file = new File([blob], "ink-coverage-report.pdf", { type: "application/pdf" });
              await navigator.share({ title: "Ink Coverage Report", text: shareText, files: [file] });
              toast.success("Shared successfully!");
              onClose();
            }
          } catch (err: any) {
            if (err?.name !== "AbortError") {
              toast.error("Share failed. Download the PDF and share it manually.");
            }
          } finally {
            setPdfLoading(null);
          }
          return;
        }
        toast.error("No shareable link available (private mode). Download the PDF to share it manually.");
        return;
      }
      const url = app.getUrl!(linkUrl, shareText);
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (app.action === "download_then_upload") {
      setPdfLoading(app.id);
      try {
        const ok = await downloadPdf();
        if (ok) {
          toast.success(app.uploadHint ?? `PDF downloaded — upload it to ${app.label}.`, { duration: 7000 });
          // Open the upload page after a short delay so the download starts first
          setTimeout(() => {
            window.open(app.uploadUrl, "_blank", "noopener,noreferrer");
          }, 800);
        } else {
          toast.error("Could not generate PDF. Please try the Download PDF button.");
        }
      } catch {
        toast.error("Failed to prepare PDF for download.");
      } finally {
        setPdfLoading(null);
      }
      return;
    }

    if (app.action === "download_pdf") {
      setPdfLoading(app.id);
      try {
        const ok = await downloadPdf();
        if (ok) toast.success("PDF downloaded — ready to share!");
        else toast.error("Could not generate PDF.");
      } catch {
        toast.error("Failed to download PDF.");
      } finally {
        setPdfLoading(null);
      }
    }
  };

  const nativeSupported = isNativeShareSupported();
  const isAnyLoading = pdfLoading !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-6 pt-6 pb-5 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Share2 className="w-5 h-5" />
              Share Results
            </DialogTitle>
            <DialogDescription className="text-slate-300 text-sm mt-1">
              Share your ink coverage report via any app
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-5">

          {/* Native Share Button — shown prominently on mobile */}
          {nativeSupported && (
            <Button
              className="w-full h-12 text-base font-semibold gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-md"
              onClick={handleNativeShare}
              disabled={isAnyLoading}
            >
              {pdfLoading === "native" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Share2 className="w-5 h-5" />
              )}
              {pdfLoading === "native" ? "Preparing…" : "Share via Apps"}
              <Badge variant="secondary" className="ml-1 text-xs bg-blue-400/30 text-white border-0">
                Opens Share Sheet
              </Badge>
            </Button>
          )}

          {/* App Grid */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {nativeSupported ? "Or choose an app" : "Share via"}
            </p>
            <div className="grid grid-cols-4 gap-3">
              {SHARE_APPS.map((app) => {
                const isLoading = pdfLoading === app.id;
                return (
                  <button
                    key={app.id}
                    onClick={() => handleAppShare(app)}
                    disabled={isAnyLoading}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-muted transition-colors disabled:opacity-50 group"
                  >
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm group-hover:scale-105 transition-transform relative"
                      style={{ backgroundColor: app.color + "22", border: `1.5px solid ${app.color}33` }}
                    >
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: app.color }} />
                      ) : (
                        app.icon
                      )}
                      {/* Upload badge for cloud apps */}
                      {(app.action === "download_then_upload") && !isLoading && (
                        <span
                          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: app.color }}
                          title="Downloads PDF then opens upload page"
                        >
                          <CloudUpload className="w-2.5 h-2.5 text-white" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-center text-muted-foreground leading-tight font-medium">
                      {app.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Hint for cloud upload apps */}
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <CloudUpload className="w-3 h-3 inline-block flex-shrink-0" />
              OneDrive &amp; Dropbox: downloads the PDF, then opens the upload page.
            </p>
          </div>

          {/* Share Link */}
          {linkUrl ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Share Link
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={linkUrl}
                  className="font-mono text-xs bg-muted/50 border-muted"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  className={copied ? "border-green-500 text-green-600" : ""}
                >
                  {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(linkUrl, "_blank")}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                🔒 Link expires in 24 hours
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <strong>No shareable link available.</strong> You are in private mode or the session has expired. Download the PDF and share the file directly.
            </div>
          )}

          {/* Download PDF to share manually */}
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={async () => {
              setPdfLoading("download");
              try {
                const ok = await downloadPdf();
                if (ok) toast.success("PDF downloaded — ready to share!");
                else toast.error("Could not generate PDF.");
              } catch {
                toast.error("Failed to download PDF.");
              } finally {
                setPdfLoading(null);
              }
            }}
            disabled={isAnyLoading}
          >
            {pdfLoading === "download" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF to Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
