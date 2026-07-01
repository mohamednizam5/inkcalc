import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Copy, ExternalLink, Download, Share2, Mail, Loader2, CheckCircle2
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
  return (
    typeof navigator !== "undefined" &&
    !!navigator.canShare &&
    navigator.canShare({ files: [new File([""], "test.pdf", { type: "application/pdf" })] })
  );
}

// ─── Share Apps Config ───────────────────────────────────────────────────────

interface ShareApp {
  id: string;
  label: string;
  color: string;
  icon: string; // emoji or SVG path
  getUrl: (url: string, text: string) => string;
}

const SHARE_APPS: ShareApp[] = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    color: "#25D366",
    icon: "💬",
    getUrl: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`,
  },
  {
    id: "gmail",
    label: "Gmail",
    color: "#EA4335",
    icon: "✉️",
    getUrl: (url, text) =>
      `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent("Ink Coverage Report")}&body=${encodeURIComponent(text + "\n\n" + url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    color: "#2CA5E0",
    icon: "✈️",
    getUrl: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "outlook",
    label: "Outlook",
    color: "#0078D4",
    icon: "📧",
    getUrl: (url, text) =>
      `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent("Ink Coverage Report")}&body=${encodeURIComponent(text + "\n\n" + url)}`,
  },
  {
    id: "teams",
    label: "Teams",
    color: "#6264A7",
    icon: "👥",
    getUrl: (url, _text) =>
      `https://teams.microsoft.com/share?href=${encodeURIComponent(url)}`,
  },
  {
    id: "onedrive",
    label: "OneDrive",
    color: "#0078D4",
    icon: "☁️",
    getUrl: (_url, _text) => "onedrive",  // handled specially — file upload
  },
  {
    id: "dropbox",
    label: "Dropbox",
    color: "#0061FF",
    icon: "📦",
    getUrl: (_url, _text) => "dropbox",  // handled specially — file upload
  },
  {
    id: "email",
    label: "Email",
    color: "#6B7280",
    icon: "📨",
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
  const [pdfLoading, setPdfLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const linkUrl = shareUrl ?? (shareToken ? `${window.location.origin}/share/${shareToken}` : null);
  const shareText = "Check out my ink coverage analysis report from InkCalc!";

  // ── Native Share (Android / iOS) ──────────────────────────────────────────
  const handleNativeShare = async () => {
    if (!isNativeShareSupported()) return;

    // Try to share the PDF file directly if supported
    if (isFileShareSupported() && sessionId) {
      setPdfLoading(true);
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
          onClose();
          return;
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          // Fall through to URL-only share
        } else {
          setPdfLoading(false);
          return;
        }
      } finally {
        setPdfLoading(false);
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
    }
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
    if (!linkUrl) {
      toast.error("No shareable link available. Please ensure you are not in private mode.");
      return;
    }

    // OneDrive and Dropbox: download the PDF first, then open the service
    if (app.id === "onedrive" || app.id === "dropbox") {
      setPdfLoading(true);
      try {
        const blob = await onGetPdfBlob();
        if (blob) {
          // Download the PDF to device first
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "ink-coverage-report.pdf";
          link.click();
          URL.revokeObjectURL(link.href);
          toast.success(
            `PDF downloaded! Now open ${app.label} and upload the file from your Downloads folder.`,
            { duration: 6000 }
          );
        }
      } catch {
        toast.error("Failed to prepare PDF for download.");
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    const url = app.getUrl(linkUrl, shareText);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const nativeSupported = isNativeShareSupported();

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
              disabled={pdfLoading}
            >
              {pdfLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Share2 className="w-5 h-5" />
              )}
              {pdfLoading ? "Preparing PDF…" : "Share via Apps"}
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
              {SHARE_APPS.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleAppShare(app)}
                  disabled={pdfLoading}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl hover:bg-muted transition-colors disabled:opacity-50 group"
                >
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm group-hover:scale-105 transition-transform"
                    style={{ backgroundColor: app.color + "22", border: `1.5px solid ${app.color}33` }}
                  >
                    {app.icon}
                  </div>
                  <span className="text-xs text-center text-muted-foreground leading-tight font-medium">
                    {app.label}
                  </span>
                </button>
              ))}
            </div>
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
              setPdfLoading(true);
              try {
                const blob = await onGetPdfBlob();
                if (blob) {
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = "ink-coverage-report.pdf";
                  link.click();
                  URL.revokeObjectURL(link.href);
                  toast.success("PDF downloaded — ready to share!");
                }
              } catch {
                toast.error("Failed to download PDF.");
              } finally {
                setPdfLoading(false);
              }
            }}
            disabled={pdfLoading}
          >
            {pdfLoading ? (
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
