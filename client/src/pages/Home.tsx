import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Upload, FileText, Settings, BarChart3, Download,
  ChevronRight, X, Lock, Unlock, Loader2, CheckCircle2,
  AlertCircle, Copy, ExternalLink, Sparkles, RefreshCw,
  FileDown, FileArchive, Printer, Layers, Share2, Gauge, ShieldCheck, CircleAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StepIndicator } from "@/components/StepIndicator";
import { AddPrinterModal, EMPTY_CUSTOM_PRINTER, type CustomPrinterData } from "@/components/AddPrinterModal";
import { ShareModal } from "@/components/ShareModal";
import { InkAssistant } from "@/components/InkAssistant";
import { CmykGroup } from "@/components/CmykBar";
import CartridgeConfig from "@/components/CartridgeConfig";
import { PRINTER_TYPE_TEMPLATES, type CartridgeDef, type PrinterType } from "../../../shared/cartridgeTypes";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepId = 1 | 2 | 3 | 4 | 5;

interface UploadedFileItem {
  file: File;
  id: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface CostParams {
  // Shared / fallback pricing (legacy — still used for old presets)
  pricePerCartridge?: number;
  yieldPages?: number;
  coveragePercent: number;
  pricePerMl?: number;
  mlPerCartridge?: number;
  // Per-channel cartridge pricing (CMYK legacy)
  cCartridgePrice?: number;
  cCartridgeYield?: number;
  mCartridgePrice?: number;
  mCartridgeYield?: number;
  yCartridgePrice?: number;
  yCartridgeYield?: number;
  kCartridgePrice?: number;
  kCartridgeYield?: number;
  // RGB inkjet printer pricing (legacy)
  colorMode?: "cmyk" | "rgb";
  rCartridgePrice?: number;
  rCartridgeYield?: number;
  gCartridgePrice?: number;
  gCartridgeYield?: number;
  bCartridgePrice?: number;
  bCartridgeYield?: number;
  // Flexible cartridge system (new — takes priority when present)
  printerType?: PrinterType;
  cartridges?: CartridgeDef[];
  /** Remaining usable ink per cartridge for Print to Empty (0–100%). */
  remainingInkPercent?: Record<string, number>;
  paperCostPerSheet: number;
  isDuplex: boolean;
  copies: number;
}

const STEPS = [
  { id: 1, label: "Upload", icon: <Upload className="w-4 h-4" /> },
  { id: 2, label: "Analyze", icon: <Layers className="w-4 h-4" /> },
  { id: 3, label: "Configure", icon: <Settings className="w-4 h-4" /> },
  { id: 4, label: "Results", icon: <BarChart3 className="w-4 h-4" /> },
  { id: 5, label: "Export", icon: <Download className="w-4 h-4" /> },
];

const SUPPORTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.tiff,.tif,.eps,.docx,.doc";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const CMYK_COLORS = ["#06b6d4", "#ec4899", "#eab308", "#1f2937"];
const RGB_COLORS  = ["#ef4444", "#22c55e", "#3b82f6"];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [fileItems, setFileItems] = useState<UploadedFileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [pollingActive, setPollingActive] = useState(false);
  // Default to 4-cartridge CMYK template
  const defaultTemplate = PRINTER_TYPE_TEMPLATES.find((t) => t.type === "4-cartridge")!;
  const [cartridges, setCartridges] = useState<CartridgeDef[]>(
    defaultTemplate.cartridges.map((c) => ({ ...c, price: 0, yield: 0 }))
  );
  const [printerType, setPrinterType] = useState<PrinterType>("4-cartridge");
  const [remainingInkPercent, setRemainingInkPercent] = useState<Record<string, number>>(
    () => Object.fromEntries(defaultTemplate.cartridges.map((cartridge) => [cartridge.id, 100]))
  );
  const [costParams, setCostParams] = useState<CostParams>({
    coveragePercent: 5,
    paperCostPerSheet: 0.01,
    isDuplex: false,
    copies: 1,
    printerType: "4-cartridge",
    cartridges: defaultTemplate.cartridges.map((c) => ({ ...c, price: 0, yield: 0 })),
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [presetName, setPresetName] = useState("");
  const [costResults, setCostResults] = useState<any>(null);
  const [exportLoading, setExportLoading] = useState<"csv" | "pdf" | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [activeBrand, setActiveBrand] = useState<string>("HP");
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [printerSearch, setPrinterSearch] = useState<string>("");
  const [appliedTonerName, setAppliedTonerName] = useState<string | null>(null);
  const [showAddPrinterForm, setShowAddPrinterForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState<string>("Hey! I'm your Ink Assistant. Let's get started! Upload your PDF, JPEG, PNG, TIFF, EPS, or Word document to begin your ink coverage analysis.");
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);
  const [customPrinter, setCustomPrinter] = useState<CustomPrinterData>({ ...EMPTY_CUSTOM_PRINTER });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── tRPC queries / mutations ──────────────────────────────────────────────
  const createSession = trpc.analysis.createSession.useMutation();
  const { data: sessionData, refetch: refetchSession } = trpc.analysis.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId && pollingActive, refetchInterval: 2000 }
  );
  const { data: results, refetch: refetchResults } = trpc.analysis.getResults.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId && currentStep >= 4 }
  );
  const { data: costPresets } = trpc.presets.listCost.useQuery();
  const { data: paperPresets } = trpc.presets.listPaper.useQuery();
  const { data: printerBrands } = trpc.printers.listBrands.useQuery();
  const { data: printerList, isLoading: printersLoading } = trpc.printers.listByBrand.useQuery(
    { brand: activeBrand },
    { enabled: activeBrand !== "Custom" }
  );
  const getPresetByPrinter = trpc.printers.getPreset.useMutation();
  const addCustomPrinterMutation = trpc.printers.addCustom.useMutation();
  const computeCosts = trpc.analysis.computeCosts.useMutation();
  const savePreset = trpc.presets.saveCost.useMutation();
  const exportCsv = trpc.analysis.exportCsv.useMutation();
  const exportPdf = trpc.analysis.exportPdf.useMutation();
  const regenerateAI = trpc.analysis.regenerateAiSummary.useMutation();

  // ─── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pollingActive) return;
    if (sessionData?.status === "complete") {
      setPollingActive(false);
      setCurrentStep(3);
      setShowDownloadPrompt(false);
      setAssistantMessage("Great news — analysis complete! Now let's configure your print costs. Select your printer brand and model from the list, choose your paper size, and enter your cartridge prices and yields. Then hit Calculate Costs to see your results!");
      toast.success("Analysis complete! Configure your cost settings.");
    } else if (sessionData?.status === "error") {
      setPollingActive(false);
      toast.error(`Analysis failed: ${sessionData.errorMessage || "Unknown error"}`);
    }
  }, [sessionData?.status, pollingActive]);

  // ─── File handling ─────────────────────────────────────────────────────────
  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) return `File too large (max 50MB): ${file.name}`;
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const validExts = SUPPORTED_EXTENSIONS.split(",");
    if (!validExts.includes(ext)) return `Unsupported format: ${ext}`;
    return null;
  };

  const addFiles = useCallback((newFiles: File[]) => {
    const items: UploadedFileItem[] = newFiles.map((file) => {
      const error = validateFile(file);
      return { file, id: Math.random().toString(36).slice(2), status: error ? "error" : "pending", error: error ?? undefined };
    });
    setFileItems((prev) => [...prev, ...items]);
  }, []);

  const removeFile = (id: string) => setFileItems((prev) => prev.filter((f) => f.id !== id));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  // ─── Upload & start analysis ───────────────────────────────────────────────
  const startAnalysis = async () => {
    const validFiles = fileItems.filter((f) => f.status !== "error");
    if (validFiles.length === 0) {
      toast.error("Please add at least one valid file.");
      return;
    }

    try {
      // Create session
      const { sessionId: sid, shareToken: token } = await createSession.mutateAsync({
        mode: isPrivateMode ? "private" : "standard",
      });
      setSessionId(sid);
      setShareToken(token);
      setCurrentStep(2);
      setShowDownloadPrompt(false);
      setAssistantMessage("Perfect! Your file is being analyzed right now. I'm using Ghostscript to separate your document into Cyan, Magenta, Yellow, and Black channels — just like a real printer does. This will only take a moment!");

      // Upload files
      const formData = new FormData();
      validFiles.forEach((item) => formData.append("files", item.file));

      setFileItems((prev) =>
        prev.map((f) => (f.status === "pending" ? { ...f, status: "uploading" } : f))
      );

      const response = await fetch(`/api/upload/${sid}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }

      setFileItems((prev) =>
        prev.map((f) => (f.status === "uploading" ? { ...f, status: "done" } : f))
      );

      // Start polling
      setPollingActive(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to start analysis");
      setCurrentStep(1);
    }
  };

  // ─── Cost calculation ──────────────────────────────────────────────────────
  const handleComputeCosts = async (paramsOverride?: CostParams) => {
    if (!sessionId) return;
    const calculationParams = {
      ...(paramsOverride ?? costParams),
      remainingInkPercent,
    };
    try {
      const result = await computeCosts.mutateAsync({ sessionId, params: calculationParams });
      setCostResults(result);
      setCurrentStep(4);
      setShowDownloadPrompt(false);
      setTimeout(() => {
        const total = result?.totalCost?.toFixed(4) ?? "0.0000";
        const ink = result?.totalInkCost?.toFixed(4) ?? "0.0000";
        const paper = result?.totalPaperCost?.toFixed(4) ?? "0.0000";
        const mode = calculationParams.colorMode === "rgb" ? "RGB" : "CMYK";
        const printToEmpty = result?.printToEmpty;
        const maxCopies = printToEmpty?.maximumCompleteCopies;
        const printToEmptyMessage = Number.isFinite(maxCopies)
          ? ` With your entered remaining ink, you can print up to ${maxCopies} complete cop${maxCopies === 1 ? "y" : "ies"} before a cartridge is expected to run out.`
          : "";
        setAssistantMessage(`Here are your results! Your total job cost is $${total}, made up of $${ink} in ink and $${paper} in paper. Check out the ${mode} breakdown charts below.${printToEmptyMessage} Would you like to download your results as a PDF report or CSV spreadsheet?`);
        setShowDownloadPrompt(true);
      }, 1200);
      await refetchResults();
    } catch (err: any) {
      toast.error(err.message || "Cost calculation failed");
    }
  };

  const resetRemainingInk = (items: CartridgeDef[]) => {
    setRemainingInkPercent(Object.fromEntries(items.map((cartridge) => [cartridge.id, 100])));
  };

  const handleUseSafePrintQuantity = async () => {
    const recommendedCopies = costResults?.printToEmpty?.recommendedCopies;
    if (!Number.isFinite(recommendedCopies) || recommendedCopies < 1) {
      toast.error("There is not enough remaining ink for a safety-buffered complete copy.");
      return;
    }
    const nextParams = { ...costParams, copies: recommendedCopies };
    setCostParams(nextParams);
    toast.success(`Set the job to ${recommendedCopies} safe complete cop${recommendedCopies === 1 ? "y" : "ies"}. Recalculating…`);
    await handleComputeCosts(nextParams);
  };

  const applyPreset = (presetId: string) => {
    const preset = costPresets?.find((p) => p.id === parseInt(presetId));
    if (!preset) return;
    setSelectedPresetId(presetId);
    const pAny = preset as any;
    // If preset has flexible cartridge data, use it
    if (pAny.cartridgesJson && Array.isArray(pAny.cartridgesJson) && pAny.cartridgesJson.length > 0) {
      const loadedCartridges = pAny.cartridgesJson as CartridgeDef[];
      const loadedType: PrinterType = pAny.printerType ?? "4-cartridge";
      setCartridges(loadedCartridges);
      setPrinterType(loadedType);
      resetRemainingInk(loadedCartridges);
      setCostParams((prev) => ({
        ...prev,
        coveragePercent: preset.coveragePercent ?? 5,
        paperCostPerSheet: preset.paperCostPerSheet ?? 0.01,
        isDuplex: preset.isDuplex ?? false,
        printerType: loadedType,
        cartridges: loadedCartridges,
      }));
    } else {
      // Legacy preset — map CMYK scalar fields to cartridge format
      const legacyCartridges: CartridgeDef[] = [
        { id: "cyan",    label: "Cyan",    channels: ["C" as const], blended: false, price: pAny.cCartridgePrice ?? 0, yield: pAny.cCartridgeYield ?? 0, color: "#06b6d4" },
        { id: "magenta", label: "Magenta", channels: ["M" as const], blended: false, price: pAny.mCartridgePrice ?? 0, yield: pAny.mCartridgeYield ?? 0, color: "#ec4899" },
        { id: "yellow",  label: "Yellow",  channels: ["Y" as const], blended: false, price: pAny.yCartridgePrice ?? 0, yield: pAny.yCartridgeYield ?? 0, color: "#eab308" },
        { id: "black",   label: "Black",   channels: ["K" as const], blended: false, price: pAny.kCartridgePrice ?? 0, yield: pAny.kCartridgeYield ?? 0, color: "#1a1a1a" },
      ].filter((c) => c.price > 0 || c.yield > 0);
      const mapped = legacyCartridges.length > 0 ? legacyCartridges : defaultTemplate.cartridges.map((c) => ({ ...c, price: 0, yield: 0 }));
      setCartridges(mapped);
      setPrinterType("4-cartridge");
      resetRemainingInk(mapped);
      setCostParams((prev) => ({
        ...prev,
        pricePerCartridge: preset.pricePerCartridge ?? undefined,
        yieldPages: preset.yieldPages ?? undefined,
        coveragePercent: preset.coveragePercent ?? 5,
        pricePerMl: preset.pricePerMl ?? undefined,
        mlPerCartridge: preset.mlPerCartridge ?? undefined,
        cCartridgePrice: pAny.cCartridgePrice || undefined,
        cCartridgeYield: pAny.cCartridgeYield || undefined,
        mCartridgePrice: pAny.mCartridgePrice || undefined,
        mCartridgeYield: pAny.mCartridgeYield || undefined,
        yCartridgePrice: pAny.yCartridgePrice || undefined,
        yCartridgeYield: pAny.yCartridgeYield || undefined,
        kCartridgePrice: pAny.kCartridgePrice || undefined,
        kCartridgeYield: pAny.kCartridgeYield || undefined,
        paperCostPerSheet: preset.paperCostPerSheet ?? 0.01,
        isDuplex: preset.isDuplex ?? false,
        printerType: "4-cartridge",
        cartridges: mapped,
      }));
    }
    setAppliedTonerName(pAny.cartridgeModel ?? preset.name);
  };

  const handleSelectPrinter = async (printerId: number, printerModel: string) => {
    setSelectedPrinterId(printerId);
    try {
      const preset = await getPresetByPrinter.mutateAsync({ printerId });
      if (!preset) { toast.error("No toner preset found for this printer."); return; }
      const pAny = preset as any;
      // If preset has flexible cartridge data, use it
      if (pAny.cartridgesJson && Array.isArray(pAny.cartridgesJson) && pAny.cartridgesJson.length > 0) {
        const loadedCartridges = pAny.cartridgesJson as CartridgeDef[];
        const loadedType: PrinterType = pAny.printerType ?? "4-cartridge";
        setCartridges(loadedCartridges);
        setPrinterType(loadedType);
        setCostParams((prev) => ({
          ...prev,
          coveragePercent: preset.coveragePercent ?? 5,
          paperCostPerSheet: preset.paperCostPerSheet ?? 0.01,
          isDuplex: preset.isDuplex ?? false,
          printerType: loadedType,
          cartridges: loadedCartridges,
        }));
      } else {
        // Legacy preset
        const legacyCartridges: CartridgeDef[] = [
          { id: "cyan",    label: "Cyan",    channels: ["C" as const], blended: false, price: pAny.cCartridgePrice ?? 0, yield: pAny.cCartridgeYield ?? 0, color: "#06b6d4" },
          { id: "magenta", label: "Magenta", channels: ["M" as const], blended: false, price: pAny.mCartridgePrice ?? 0, yield: pAny.mCartridgeYield ?? 0, color: "#ec4899" },
          { id: "yellow",  label: "Yellow",  channels: ["Y" as const], blended: false, price: pAny.yCartridgePrice ?? 0, yield: pAny.yCartridgeYield ?? 0, color: "#eab308" },
          { id: "black",   label: "Black",   channels: ["K" as const], blended: false, price: pAny.kCartridgePrice ?? 0, yield: pAny.kCartridgeYield ?? 0, color: "#1a1a1a" },
        ].filter((c) => c.price > 0 || c.yield > 0);
        const mapped = legacyCartridges.length > 0 ? legacyCartridges : defaultTemplate.cartridges.map((c) => ({ ...c, price: 0, yield: 0 }));
        setCartridges(mapped);
        setPrinterType("4-cartridge");
        setCostParams((prev) => ({
          ...prev,
          pricePerCartridge: preset.pricePerCartridge ?? undefined,
          yieldPages: preset.yieldPages ?? undefined,
          coveragePercent: preset.coveragePercent ?? 5,
          pricePerMl: preset.pricePerMl ?? undefined,
          mlPerCartridge: preset.mlPerCartridge ?? undefined,
          cCartridgePrice: pAny.cCartridgePrice || undefined,
          cCartridgeYield: pAny.cCartridgeYield || undefined,
          mCartridgePrice: pAny.mCartridgePrice || undefined,
          mCartridgeYield: pAny.mCartridgeYield || undefined,
          yCartridgePrice: pAny.yCartridgePrice || undefined,
          yCartridgeYield: pAny.yCartridgeYield || undefined,
          kCartridgePrice: pAny.kCartridgePrice || undefined,
          kCartridgeYield: pAny.kCartridgeYield || undefined,
          paperCostPerSheet: preset.paperCostPerSheet ?? 0.01,
          isDuplex: preset.isDuplex ?? false,
          printerType: "4-cartridge",
          cartridges: mapped,
        }));
      }
      setSelectedPresetId(String(preset.id));
      const tonerName = pAny.cartridgeModel ?? preset.name;
      setAppliedTonerName(tonerName);
      toast.success(`Loaded: ${tonerName} for ${printerModel}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to load toner preset");
    }
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) { toast.error("Enter a preset name"); return; }
    try {
      await savePreset.mutateAsync({ name: presetName.trim(), ...costParams });
      toast.success("Preset saved!");
      setPresetName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save preset");
    }
  };

  const handleAddCustomPrinter = async (data: CustomPrinterData) => {
    try {
      const payload: any = {
        brand: data.brand.trim(),
        model: data.model.trim(),
      };
      if (data.series.trim()) payload.series = data.series.trim();
      if (data.cartridgeModel.trim()) payload.cartridgeModel = data.cartridgeModel.trim();
      payload.cartridgeType = data.cartridgeType;
      if (data.cCartridgePrice) payload.cCartridgePrice = parseFloat(data.cCartridgePrice);
      if (data.cCartridgeYield) payload.cCartridgeYield = parseInt(data.cCartridgeYield);
      if (data.mCartridgePrice) payload.mCartridgePrice = parseFloat(data.mCartridgePrice);
      if (data.mCartridgeYield) payload.mCartridgeYield = parseInt(data.mCartridgeYield);
      if (data.yCartridgePrice) payload.yCartridgePrice = parseFloat(data.yCartridgePrice);
      if (data.yCartridgeYield) payload.yCartridgeYield = parseInt(data.yCartridgeYield);
      if (data.kCartridgePrice) payload.kCartridgePrice = parseFloat(data.kCartridgePrice);
      if (data.kCartridgeYield) payload.kCartridgeYield = parseInt(data.kCartridgeYield);
      if (data.pricePerCartridge) payload.pricePerCartridge = parseFloat(data.pricePerCartridge);
      if (data.yieldPages) payload.yieldPages = parseInt(data.yieldPages);
      if (data.coveragePercent) payload.coveragePercent = parseFloat(data.coveragePercent);
      if (data.pricePerMl) payload.pricePerMl = parseFloat(data.pricePerMl);
      if (data.mlPerCartridge) payload.mlPerCartridge = parseFloat(data.mlPerCartridge);
      const result = await addCustomPrinterMutation.mutateAsync(payload);
      toast.success(`Printer "${data.model}" added! Loading its preset…`);
      await handleSelectPrinter(result.printerId, data.model);
      setShowAddPrinterForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to add printer");
    }
  };

  // ─── Export ────────────────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (!sessionId) return;
    setExportLoading("csv");
    try {
      const result = await exportCsv.mutateAsync({ sessionId, params: costParams });
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ink-coverage-report-${sessionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded!");
    } catch (err: any) {
      toast.error(err.message || "CSV export failed");
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportPdf = async () => {
    if (!sessionId) return;
    setExportLoading("pdf");
    try {
      const result = await exportPdf.mutateAsync({ sessionId, params: costParams });
      if (result.isDataUrl) {
        // Private mode: data URL — decode and trigger download directly
        const byteStr = atob(result.url.split(",")[1]);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ink-coverage-report-${sessionId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        // Standard mode: fetch the S3 URL and trigger download
        const resp = await fetch(result.url);
        const blob = await resp.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `ink-coverage-report-${sessionId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
      toast.success("PDF report downloaded!");
    } catch (err: any) {
      toast.error(err.message || "PDF export failed");
    } finally {
      setExportLoading(null);
    }
  };

  // Returns the PDF as a Blob (used by ShareModal for native file sharing)
  const getPdfBlob = async (): Promise<Blob | null> => {
    if (!sessionId) return null;
    try {
      const result = await exportPdf.mutateAsync({ sessionId, params: costParams });
      if (result.isDataUrl) {
        const byteStr = atob(result.url.split(",")[1]);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        return new Blob([arr], { type: "application/pdf" });
      } else {
        const resp = await fetch(result.url);
        return await resp.blob();
      }
    } catch {
      return null;
    }
  };

  const handleCopyShareLink = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/share/${shareToken}`;
    setShareUrl(url);
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard!");
  };

  const handleRegenerateAI = async () => {
    if (!sessionId) return;
    try {
      await regenerateAI.mutateAsync({ sessionId });
      await refetchResults();
      toast.success("AI summary regenerated!");
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate AI summary");
    }
  };

  // ─── Render helpers ────────────────────────────────────────────────────────
  const pages = results?.pages ?? [];
  const files = results?.files ?? [];
  const aiSummary = results?.aiSummary;

  const avgCoverage = pages.length > 0 ? {
    c: pages.reduce((s, p) => s + (p.cCoverage ?? 0), 0) / pages.length,
    m: pages.reduce((s, p) => s + (p.mCoverage ?? 0), 0) / pages.length,
    y: pages.reduce((s, p) => s + (p.yCoverage ?? 0), 0) / pages.length,
    k: pages.reduce((s, p) => s + (p.kCoverage ?? 0), 0) / pages.length,
    tac: pages.reduce((s, p) => s + (p.tac ?? 0), 0) / pages.length,
  } : null;

  const chartData = pages.map((p, i) => ({
    name: `P${p.pageNumber}`,
    C: +(p.cCoverage ?? 0).toFixed(2),
    M: +(p.mCoverage ?? 0).toFixed(2),
    Y: +(p.yCoverage ?? 0).toFixed(2),
    K: +(p.kCoverage ?? 0).toFixed(2),
  }));

  const pieData = avgCoverage ? [
    { name: "Cyan", value: +avgCoverage.c.toFixed(2) },
    { name: "Magenta", value: +avgCoverage.m.toFixed(2) },
    { name: "Yellow", value: +avgCoverage.y.toFixed(2) },
    { name: "Black", value: +avgCoverage.k.toFixed(2) },
  ].filter((d) => d.value > 0) : [];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Printer className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-none" style={{ fontFamily: "var(--font-display)" }}>
                InkCalc
              </h1>
              <p className="text-xs text-muted-foreground">Print Cost Calculator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 cursor-pointer" onClick={() => currentStep === 1 && setIsPrivateMode((v) => !v)}>
                  {isPrivateMode ? <Lock className="w-3.5 h-3.5 text-amber-600" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="text-xs font-medium text-muted-foreground">
                    {isPrivateMode ? "Private Mode" : "Standard Mode"}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isPrivateMode ? "Files processed in-memory only — never stored" : "Files stored securely for 24h with shareable links"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="container py-8 pb-52 space-y-8">
        {/* ── Step Indicator ── */}
        <div className="px-2">
          <StepIndicator steps={STEPS} currentStep={currentStep} />
        </div>

        {/* ── Step Content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            {/* ── Step 1: Upload ── */}
            {currentStep === 1 && (
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                    Upload Your Documents
                  </h2>
                  <p className="text-muted-foreground">
                    Drag and drop files or click to browse. Supports PDF, JPEG, PNG, TIFF, EPS, and DOCX.
                  </p>
                </div>

                {/* Private mode toggle */}
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Lock className="w-4 h-4 text-amber-600" />
                        <div>
                          <p className="text-sm font-semibold text-amber-900">Private Mode</p>
                          <p className="text-xs text-amber-700">Files are processed in-memory only and never stored on our servers</p>
                        </div>
                      </div>
                      <Switch checked={isPrivateMode} onCheckedChange={setIsPrivateMode} />
                    </div>
                  </CardContent>
                </Card>

                {/* Drop zone */}
                <div
                  className={cn("upload-zone p-12 text-center cursor-pointer transition-all", isDragOver && "drag-over")}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={SUPPORTED_EXTENSIONS}
                    className="hidden"
                    onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                  />
                  <motion.div animate={{ scale: isDragOver ? 1.05 : 1 }} transition={{ duration: 0.15 }}>
                    <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-base font-semibold text-foreground mb-1">
                      {isDragOver ? "Drop files here" : "Drag & drop files here"}
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">or click to browse</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {["PDF", "JPEG", "PNG", "TIFF", "EPS", "DOCX"].map((ext) => (
                        <Badge key={ext} variant="secondary" className="text-xs">{ext}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">Max 50MB per file</p>
                  </motion.div>
                </div>

                {/* File list */}
                {fileItems.length > 0 && (
                  <div className="space-y-2">
                    {fileItems.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border",
                          item.status === "error" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
                        )}
                      >
                        <FileText className={cn("w-4 h-4 flex-shrink-0", item.status === "error" ? "text-destructive" : "text-primary")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                            {item.error && <span className="text-destructive ml-2">{item.error}</span>}
                          </p>
                        </div>
                        {item.status === "error" ? (
                          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                        <button onClick={() => removeFile(item.id)} className="p-1 rounded hover:bg-muted transition-colors">
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={startAnalysis}
                  disabled={fileItems.filter((f) => f.status !== "error").length === 0 || createSession.isPending}
                  size="lg"
                  className="w-full"
                >
                  {createSession.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting Analysis…</>
                  ) : (
                    <><ChevronRight className="w-4 h-4 mr-2" /> Analyze Ink Coverage</>
                  )}
                </Button>
              </div>
            )}

            {/* ── Step 2: Analyzing ── */}
            {currentStep === 2 && (
              <div className="max-w-lg mx-auto text-center space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Analyzing Documents</h2>
                  <p className="text-muted-foreground">Rasterizing pages and computing CMYK ink coverage…</p>
                </div>

                <div className="relative w-32 h-32 mx-auto">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
                    <motion.circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="var(--primary)" strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="263.9"
                      initial={{ strokeDashoffset: 263.9 }}
                      animate={{ strokeDashoffset: [263.9, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Layers className="w-10 h-10 text-primary" />
                  </div>
                </div>

                <div className="space-y-3">
                  {fileItems.filter((f) => f.status !== "error").map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">{item.file.name}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  This may take a moment for multi-page documents. Please wait…
                </p>
              </div>
            )}

            {/* ── Step 3: Configure Costs ── */}
            {currentStep === 3 && (
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Configure Print Costs</h2>
                  <p className="text-muted-foreground">Enter your consumable pricing to calculate accurate print costs.</p>
                </div>

                {/* Quick summary of analysis */}
                {avgCoverage && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">Analysis Complete — {pages.length} page{pages.length !== 1 ? "s" : ""} analyzed</span>
                      </div>
                      <CmykGroup c={avgCoverage.c} m={avgCoverage.m} y={avgCoverage.y} k={avgCoverage.k} tac={avgCoverage.tac} size="sm" />
                    </CardContent>
                  </Card>
                )}

                {/* Applied toner confirmation banner */}
                {appliedTonerName && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-50 border border-green-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-green-800">
                      Toner loaded: <strong>{appliedTonerName}</strong> — prices and yields have been applied below.
                    </span>
                    <button
                      onClick={() => setAppliedTonerName(null)}
                      className="ml-auto p-1 rounded hover:bg-green-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-green-600" />
                    </button>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* ── Printer / Toner Selector ── */}
                  <Card className="md:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Printer className="w-4 h-4" /> Select Your Printer
                      </CardTitle>
                      <CardDescription>
                        Choose your brand and printer model — the correct toner cartridge, prices, and yields will be loaded automatically.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Brand tabs */}
                      {(() => {
                        const dbBrands = printerBrands ?? ["HP", "Canon", "Epson", "Brother", "Samsung", "Xerox", "Lexmark", "Konica Minolta"];
                        const brands = [...dbBrands, "Custom"];
                        const brandColors: Record<string, string> = {
                          HP: "#0096d6",
                          Canon: "#cc0000",
                          Epson: "#003087",
                          Brother: "#e8400c",
                          Samsung: "#1428a0",
                          Xerox: "#e5202e",
                          Lexmark: "#00833e",
                          "Konica Minolta": "#e4002b",
                          Ricoh: "#005bac",
                          Kyocera: "#cc0000",
                          OKI: "#0066cc",
                          Sharp: "#1a1a1a",
                          Toshiba: "#e60012",
                          Fujifilm: "#ff0000",
                          Develop: "#003087",
                          Kodak: "#ffd700",
                          Olivetti: "#cc0000",
                          Panasonic: "#003087",
                          Pantum: "#0066cc",
                          Sindoh: "#0066cc",
                          Lenovo: "#e2231a",
                          Custom: "#6b7280",
                        };
                        return (
                          <>
                            {/* Step 1: Brand */}
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">1. Select Brand</p>
                              <div className="flex gap-2 flex-wrap">
                                {brands.map((b) => (
                                  <button
                                    key={b}
                                    onClick={() => { setActiveBrand(b); setSelectedPrinterId(null); setPrinterSearch(""); }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                      activeBrand === b
                                        ? "text-white border-transparent"
                                        : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                                    }`}
                                    style={activeBrand === b ? { backgroundColor: brandColors[b] } : {}}
                                  >
                                    {b}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Step 2: Printer model (only for non-Custom brands) */}
                            {activeBrand !== "Custom" && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">2. Select Printer Model</p>
                                {/* Search */}
                                <input
                                  type="text"
                                  placeholder={`Search ${activeBrand} printers…`}
                                  value={printerSearch}
                                  onChange={(e) => setPrinterSearch(e.target.value)}
                                  className="w-full mb-3 px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                {printersLoading ? (
                                  <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Loading printers…
                                  </div>
                                ) : (
                                  (() => {
                                    const filtered = (printerList ?? []).filter((pr) =>
                                      !printerSearch || pr.model.toLowerCase().includes(printerSearch.toLowerCase()) ||
                                      (pr.series ?? "").toLowerCase().includes(printerSearch.toLowerCase())
                                    );
                                    if (filtered.length === 0) return (
                                      <div className="py-2 space-y-2">
                                        <p className="text-sm text-muted-foreground">No {activeBrand} printers found{printerSearch ? ` for "${printerSearch}"` : ""}.</p>
                                        <button
                                          onClick={() => setShowAddPrinterForm(true)}
                                          className="flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5 transition-colors"
                                        >
                                          <span>+ Add Your Printer</span>
                                        </button>
                                      </div>
                                    );
                                    // Group by series
                                    const grouped: Record<string, typeof filtered> = {};
                                    filtered.forEach((pr) => {
                                      const key = pr.series ?? "Other";
                                      if (!grouped[key]) grouped[key] = [];
                                      grouped[key].push(pr);
                                    });
                                    return (
                                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                                        {Object.entries(grouped).map(([series, printers]) => (
                                          <div key={series}>
                                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{series}</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                              {printers.map((pr) => {
                                                const isSelected = selectedPrinterId === pr.id;
                                                return (
                                                  <button
                                                    key={pr.id}
                                                    onClick={() => handleSelectPrinter(pr.id, pr.model)}
                                                    disabled={getPresetByPrinter.isPending && selectedPrinterId === pr.id}
                                                    title={pr.model}
                                                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-all w-full ${
                                                      isSelected
                                                        ? "border-primary bg-primary/5 ring-1 ring-primary/30 font-semibold text-primary"
                                                        : "border-border hover:border-primary/40 hover:bg-muted/40"
                                                    }`}
                                                  >
                                                    {getPresetByPrinter.isPending && selectedPrinterId === pr.id ? (
                                                      <span className="flex items-center gap-1.5">
                                                        <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                                                      </span>
                                                    ) : (
                                                      <span className="flex items-start justify-between gap-1">
                                                        <span className="break-words whitespace-normal leading-snug">{pr.model}</span>
                                                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />}
                                                      </span>
                                                    )}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            )}

                            {/* Add Your Printer link always visible at bottom of printer list */}
                            {activeBrand !== "Custom" && !showAddPrinterForm && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <button
                                  onClick={() => setShowAddPrinterForm(true)}
                                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                  Can&apos;t find your printer? <span className="font-semibold text-primary">+ Add it here</span>
                                </button>
                              </div>
                            )}

                            {/* Add Your Printer Modal (rendered at root level below) */}

                            {/* Custom presets tab */}
                            {activeBrand === "Custom" && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Your Saved Presets</p>
                                {(() => {
                                  const customPresets = costPresets?.filter((p) => !(p as any).brand) ?? [];
                                  if (customPresets.length === 0) return (
                                    <p className="text-sm text-muted-foreground py-2">No saved presets yet. Configure pricing below and save a preset.</p>
                                  );
                                  return (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {customPresets.map((p) => {
                                        const isSelected = selectedPresetId === String(p.id);
                                        return (
                                          <button
                                            key={p.id}
                                            onClick={() => applyPreset(String(p.id))}
                                            className={`text-left p-3 rounded-lg border transition-all ${
                                              isSelected
                                                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                                : "border-border hover:border-primary/40 hover:bg-muted/40"
                                            }`}
                                          >
                                            <span className="text-sm font-semibold">{p.name}</span>
                                            {isSelected && <div className="mt-1 text-[10px] font-semibold text-primary">✓ Applied</div>}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Paper size */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Paper Size</CardTitle>
                      <CardDescription>Select the paper format for cost calculation</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select paper size…" />
                        </SelectTrigger>
                        <SelectContent>
                          {paperPresets?.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name} ({p.widthMm}×{p.heightMm}mm)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                </div>

                {/* Flexible Cartridge Config */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Ink / Toner Pricing</CardTitle>
                    <CardDescription>
                      Select your printer type and enter cartridge prices and page yields.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CartridgeConfig
                      cartridges={cartridges}
                      printerType={printerType}
                      coveragePercent={costParams.coveragePercent}
                      remainingInkPercent={remainingInkPercent}
                      onRemainingInkChange={(cartridgeId, percent) => {
                        setRemainingInkPercent((previous) => ({ ...previous, [cartridgeId]: percent }));
                      }}
                      onChange={(newCartridges, newType) => {
                        setCartridges(newCartridges);
                        setPrinterType(newType);
                        setRemainingInkPercent((previous) => {
                          const next: Record<string, number> = {};
                          for (const cartridge of newCartridges) next[cartridge.id] = previous[cartridge.id] ?? 100;
                          return next;
                        });
                        setCostParams((prev) => ({
                          ...prev,
                          printerType: newType,
                          cartridges: newCartridges,
                        }));
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Paper & job settings */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Paper & Job Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="paperCost">Paper Cost per Sheet ($)</Label>
                        <Input
                          id="paperCost"
                          type="number"
                          min="0"
                          step="0.001"
                          defaultValue={costParams.paperCostPerSheet}
                          key={`paper-${costParams.paperCostPerSheet}`}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v >= 0) setCostParams((p) => ({ ...p, paperCostPerSheet: v }));
                          }}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value);
                            setCostParams((p) => ({ ...p, paperCostPerSheet: isNaN(v) || v < 0 ? 0 : v }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="copies">Number of Copies</Label>
                        <Input
                          id="copies"
                          type="number"
                          min="1"
                          defaultValue={costParams.copies}
                          key={`copies-${costParams.copies}`}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v >= 1) setCostParams((p) => ({ ...p, copies: v }));
                          }}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setCostParams((p) => ({ ...p, copies: isNaN(v) || v < 1 ? 1 : v }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Print Mode</Label>
                        <div className="flex items-center gap-3 h-10">
                          <Switch
                            checked={costParams.isDuplex}
                            onCheckedChange={(v) => setCostParams((p) => ({ ...p, isDuplex: v }))}
                          />
                          <span className="text-sm">{costParams.isDuplex ? "Duplex (double-sided)" : "Simplex (single-sided)"}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Save preset */}
                <Card className="bg-muted/30">
                  <CardContent className="py-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Preset name…"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        className="flex-1"
                      />
                      <Button variant="outline" onClick={handleSavePreset} disabled={savePreset.isPending}>
                        {savePreset.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Preset"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Button
                  onClick={() => handleComputeCosts()}
                  disabled={computeCosts.isPending}
                  size="lg"
                  className="w-full"
                >
                  {computeCosts.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculating…</>
                  ) : (
                    <><BarChart3 className="w-4 h-4 mr-2" /> Calculate Costs & View Results</>
                  )}
                </Button>
              </div>
            )}

            {/* ── Step 4: Results ── */}
            {currentStep === 4 && costResults && (
              <div className="space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Analysis Results</h2>
                  <p className="text-muted-foreground">Detailed ink coverage and cost breakdown for your print job.</p>
                </div>

                {/* ── Total Cost Hero Banner ── */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white px-6 py-6 shadow-lg">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    {/* Main total */}
                    <div className="text-center sm:text-left">
                      <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Total Job Cost</p>
                      <p className="text-5xl font-extrabold font-mono tabular-nums tracking-tight">
                        ${(isNaN(costResults.totalCost) ? 0 : costResults.totalCost).toFixed(4)}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        {costParams.copies} cop{costParams.copies !== 1 ? "ies" : "y"} &nbsp;·&nbsp; {costResults.perPage?.length ?? 0} page{(costResults.perPage?.length ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Sub-totals */}
                    <div className="flex gap-6 sm:gap-8">
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Cost / Copy</p>
                        <p className="text-2xl font-bold font-mono tabular-nums">${(isNaN(costResults.costPerCopy) ? 0 : costResults.costPerCopy).toFixed(4)}</p>
                      </div>
                      <div className="w-px bg-slate-700 hidden sm:block" />
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Ink</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-cyan-400">${(isNaN(costResults.totalInkCost) ? 0 : costResults.totalInkCost).toFixed(4)}</p>
                      </div>
                      <div className="w-px bg-slate-700 hidden sm:block" />
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Paper</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400">${(isNaN(costResults.totalPaperCost) ? 0 : costResults.totalPaperCost).toFixed(4)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Cost bar */}
                  {costResults.totalCost > 0 && (
                    <div className="mt-5">
                      <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                        <span>Ink share</span>
                        <span>Paper share</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-700 overflow-hidden flex">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-l-full transition-all"
                          style={{ width: `${Math.round((costResults.totalInkCost / costResults.totalCost) * 100)}%` }}
                        />
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-r-full transition-all"
                          style={{ width: `${Math.round((costResults.totalPaperCost / costResults.totalCost) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-slate-400 mt-1.5">
                        <span className="text-cyan-400">{Math.round((costResults.totalInkCost / costResults.totalCost) * 100)}%</span>
                        <span className="text-emerald-400">{Math.round((costResults.totalPaperCost / costResults.totalCost) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Print to Empty ── */}
                {(() => {
                  const printToEmpty = costResults?.printToEmpty;
                  if (!printToEmpty) return null;
                  const isReady = Boolean(printToEmpty.isReady);
                  const maximumCopies = printToEmpty.maximumCompleteCopies;
                  const recommendedCopies = printToEmpty.recommendedCopies;
                  const isRequestedQuantityTooHigh = isReady
                    && Number.isFinite(maximumCopies)
                    && costParams.copies > maximumCopies;
                  const missingYieldLabels = (printToEmpty.cartridgeEstimates ?? [])
                    .filter((estimate: any) => estimate.status === "missing-yield")
                    .map((estimate: any) => estimate.label);

                  return (
                    <Card className="overflow-hidden border-violet-200 shadow-sm">
                      <CardHeader className="bg-gradient-to-r from-violet-50 via-indigo-50 to-sky-50 pb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                              <Gauge className="h-5 w-5" />
                            </div>
                            <div>
                              <CardTitle className="text-lg text-slate-900">Print to Empty</CardTitle>
                              <CardDescription className="mt-1 max-w-2xl text-slate-600">
                                Estimate how many <strong>complete copies</strong> of this exact job can print from the remaining ink before a cartridge is expected to run out.
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline" className="w-fit border-violet-300 bg-white/80 text-violet-700">
                            {printToEmpty.safetyReservePercent}% safety reserve
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-5 pt-5">
                        {isReady ? (
                          <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maximum complete copies</p>
                                <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">{maximumCopies}</p>
                                <p className="mt-1 text-xs text-slate-500">Estimated until the first cartridge empties</p>
                              </div>
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Recommended print quantity</p>
                                <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-emerald-700">{recommendedCopies}</p>
                                <p className="mt-1 text-xs text-emerald-700/80">Keeps {printToEmpty.safetyReservePercent}% ink in reserve</p>
                              </div>
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Limiting cartridge</p>
                                <p className="mt-1 text-xl font-bold text-amber-900">{printToEmpty.limitingCartridge?.label ?? "—"}</p>
                                <p className="mt-1 text-xs text-amber-700/80">This cartridge will run out first</p>
                              </div>
                            </div>

                            {isRequestedQuantityTooHigh ? (
                              <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex gap-2.5 text-sm text-rose-900">
                                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                                  <p>Your requested quantity of <strong>{costParams.copies}</strong> copies exceeds the estimated maximum of <strong>{maximumCopies}</strong>. Reduce it to avoid unfinished prints.</p>
                                </div>
                                <Button size="sm" onClick={handleUseSafePrintQuantity} disabled={computeCosts.isPending || !recommendedCopies} className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
                                  <ShieldCheck className="mr-1.5 h-4 w-4" /> Use {recommendedCopies} Safe Copies
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex gap-2.5 text-sm text-emerald-900">
                                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                  <p>{costParams.copies <= (recommendedCopies ?? 0) ? "Your selected quantity is within the recommended safe limit." : `Your selected quantity is below the theoretical maximum, but ${recommendedCopies} copies is the safety-buffered recommendation.`}</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={handleUseSafePrintQuantity} disabled={computeCosts.isPending || !recommendedCopies} className="shrink-0 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100">
                                  Use {recommendedCopies} Safe Copies
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                            <div>
                              <p className="font-semibold">Print to Empty needs a page yield for every cartridge used by this job.</p>
                              <p className="mt-1 text-amber-800/90">{missingYieldLabels.length ? `Add a valid page yield for ${missingYieldLabels.join(", ")}, then calculate again.` : "Enter your cartridge yields and remaining ink levels, then calculate again."}</p>
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Remaining-ink estimate by cartridge</p>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {(printToEmpty.cartridgeEstimates ?? []).map((estimate: any) => (
                              <div key={estimate.cartridgeId} className={cn("rounded-lg border px-3 py-2.5", estimate.isLimiting ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-sm font-semibold text-slate-800">{estimate.label}</span>
                                  <span className="text-xs font-medium text-slate-600">{estimate.remainingInkPercent}% remaining</span>
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                  <div className={cn("h-full rounded-full", estimate.isLimiting ? "bg-amber-500" : "bg-violet-500")} style={{ width: `${Math.min(100, Math.max(0, estimate.remainingInkPercent ?? 0))}%` }} />
                                </div>
                                <p className="mt-1.5 text-xs text-slate-600">
                                  {estimate.status === "ready" ? `${estimate.estimatedCompleteCopies} complete copies estimated` : estimate.status === "no-document-ink-use" ? "No ink from this cartridge is used by this job" : "Add a valid page yield to estimate capacity"}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <p className="text-xs leading-relaxed text-muted-foreground">Estimate only: actual yield varies with printer cleaning cycles, print mode, paper, environmental conditions, and cartridge-gauge accuracy. The recommended quantity intentionally retains a {printToEmpty.safetyReservePercent}% ink reserve.</p>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* ── PDF Download Banner ── */}
                <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/60 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                      <FileDown className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-900">Download PDF Report</p>
                      <p className="text-xs text-red-700/80">Branded report with {costResults?.colorMode === "rgb" ? "RGB" : "CMYK"} coverage, cost breakdown, and AI recommendations</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleExportPdf}
                    disabled={exportLoading === "pdf"}
                    className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  >
                    {exportLoading === "pdf" ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                    ) : (
                      <><FileDown className="w-4 h-4 mr-2" />Download PDF</>
                    )}
                  </Button>
                </div>

                {/* Cost summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Job Cost", value: `$${costResults.totalCost.toFixed(4)}`, sub: `${costParams.copies} cop${costParams.copies !== 1 ? "ies" : "y"}`, accent: true },
                    { label: "Cost per Copy", value: `$${costResults.costPerCopy.toFixed(4)}`, sub: `${pages.length} page${pages.length !== 1 ? "s" : ""}` },
                    { label: "Ink Cost", value: `$${costResults.totalInkCost.toFixed(4)}`, sub: "total ink" },
                    { label: "Paper Cost", value: `$${costResults.totalPaperCost.toFixed(4)}`, sub: "total paper" },
                  ].map((card) => (
                    <Card key={card.label} className={cn("card-lift", card.accent && "border-primary/30 bg-primary/5")}>
                      <CardContent className="py-4 text-center">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{card.label}</p>
                        <p className={cn("text-2xl font-bold font-mono tabular-nums", card.accent ? "text-primary" : "text-foreground")}>{card.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Charts */}
                {(() => {
                  const isRgbChart = costResults?.colorMode === "rgb";
                  const rgbChartData = pages.map((p) => ({
                    name: `P${p.pageNumber}`,
                    R: +((p as any).rCoverage ?? 0).toFixed(2),
                    G: +((p as any).gCoverage ?? 0).toFixed(2),
                    B: +((p as any).bCoverage ?? 0).toFixed(2),
                  }));
                  const rgbPieData = [
                    { name: "Red",   value: +(pages.reduce((s, p) => s + ((p as any).rCoverage ?? 0), 0) / Math.max(pages.length, 1)).toFixed(2) },
                    { name: "Green", value: +(pages.reduce((s, p) => s + ((p as any).gCoverage ?? 0), 0) / Math.max(pages.length, 1)).toFixed(2) },
                    { name: "Blue",  value: +(pages.reduce((s, p) => s + ((p as any).bCoverage ?? 0), 0) / Math.max(pages.length, 1)).toFixed(2) },
                  ].filter((d) => d.value > 0);
                  return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Per-page coverage chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Per-Page {isRgbChart ? "RGB" : "CMYK"} Coverage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={isRgbChart ? rgbChartData : chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} unit="%" />
                          <RechartTooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}
                            formatter={(v: number) => `${v.toFixed(2)}%`}
                          />
                          {isRgbChart ? (
                            <>
                              <Bar dataKey="R" fill="#ef4444" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="G" fill="#22c55e" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="B" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                            </>
                          ) : (
                            <>
                              <Bar dataKey="C" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="M" fill="#ec4899" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="Y" fill="#eab308" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="K" fill="#374151" radius={[2, 2, 0, 0]} />
                            </>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Channel distribution pie */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Average Channel Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(isRgbChart ? rgbPieData : pieData).length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={isRgbChart ? rgbPieData : pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                              {(isRgbChart ? rgbPieData : pieData).map((_, index) => (
                                <Cell key={index} fill={(isRgbChart ? RGB_COLORS : CMYK_COLORS)[index]} />
                              ))}
                            </Pie>
                            <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
                            <RechartTooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No ink coverage detected</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
                  );
                })()}

                {/* Per-channel cost breakdown */}
                {costResults.perChannel && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Cost Breakdown by Channel</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {costResults.perChannel.map((ch: any, i: number) => {
                          const channelColors = costResults.colorMode === "rgb" ? RGB_COLORS : CMYK_COLORS;
                          return (
                          <div key={ch.channel} className="text-center p-3 rounded-lg bg-muted/40">
                            <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ background: channelColors[i] }} />
                            <p className="text-xs font-medium text-muted-foreground">{ch.channel}</p>
                            <p className="text-lg font-bold font-mono tabular-nums mt-1">${ch.cost.toFixed(4)}</p>
                            <p className="text-xs text-muted-foreground">{ch.avgCoverage.toFixed(2)}% avg</p>
                          </div>
                        ); })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Per-page table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Per-Page Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto pr-4 sm:pr-6">
                    {(() => {
                      const isRgb = costResults.colorMode === "rgb";
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-xs font-semibold text-muted-foreground">File</th>
                              <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground">Page</th>
                              {isRgb ? (
                                <>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-red-500">R%</th>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-green-600">G%</th>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-blue-600">B%</th>
                                </>
                              ) : (
                                <>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-cyan-600">C%</th>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-pink-600">M%</th>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-yellow-600">Y%</th>
                                  <th className="text-right py-2 px-2 text-xs font-semibold text-gray-700">K%</th>
                                </>
                              )}
                              <th className="text-right py-2 px-2 text-xs font-semibold text-muted-foreground">Total Ink Cov%</th>
                              <th className="text-right py-2 px-2 pr-4 text-xs font-semibold text-muted-foreground">Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {costResults.perPage.map((row: any, i: number) => {
                              const file = files.find((f) => f.id === row.fileId);
                              const tic = isRgb
                                ? ((row.rCoverage ?? 0) + (row.gCoverage ?? 0) + (row.bCoverage ?? 0))
                                : row.tac;
                              return (
                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                  <td className="py-2 px-2 text-xs text-muted-foreground max-w-[120px] truncate">{file?.filename ?? `File ${row.fileId}`}</td>
                                  <td className="py-2 px-2 text-right font-mono">{row.pageNumber}</td>
                                  {isRgb ? (
                                    <>
                                      <td className="py-2 px-2 text-right font-mono text-red-500">{(row.rCoverage ?? 0).toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right font-mono text-green-600">{(row.gCoverage ?? 0).toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right font-mono text-blue-600">{(row.bCoverage ?? 0).toFixed(2)}</td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="py-2 px-2 text-right font-mono text-cyan-600">{(row.cCoverage ?? 0).toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right font-mono text-pink-600">{(row.mCoverage ?? 0).toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right font-mono text-yellow-600">{(row.yCoverage ?? 0).toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right font-mono text-gray-700">{(row.kCoverage ?? 0).toFixed(2)}</td>
                                    </>
                                  )}
                                  <td className="py-2 px-2 text-right font-mono font-semibold">{(isNaN(tic) ? 0 : tic).toFixed(2)}</td>
                                  <td className="py-2 px-2 pr-4 text-right font-mono font-semibold">${(isNaN(row.totalCostPerPage) ? 0 : row.totalCostPerPage).toFixed(4)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* AI Summary */}
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <CardTitle className="text-base">AI Analysis & Recommendations</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRegenerateAI}
                        disabled={regenerateAI.isPending}
                        className="text-xs"
                      >
                        {regenerateAI.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        <span className="ml-1.5">Regenerate</span>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {aiSummary ? (
                      <>
                        <p className="text-sm text-foreground leading-relaxed">{aiSummary.summary}</p>
                        {Array.isArray(aiSummary.recommendations) && aiSummary.recommendations.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cost-Saving Recommendations</p>
                            <ul className="space-y-2">
                              {(aiSummary.recommendations as string[]).map((rec, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm">
                                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold">{i + 1}</span>
                                  <span className="text-muted-foreground">{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Generating AI summary…</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex gap-3 justify-between flex-wrap">
                  <Button variant="outline" onClick={() => setCurrentStep(3)}>
                    Adjust Settings
                  </Button>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={handleExportPdf}
                      disabled={exportLoading === "pdf"}
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {exportLoading === "pdf" ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4 mr-2" />
                      )}
                      Download PDF
                    </Button>
                    <Button onClick={() => setCurrentStep(5)}>
                      <Download className="w-4 h-4 mr-2" /> Export & Share
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 5: Export & Share ── */}
            {currentStep === 5 && (
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Export & Share</h2>
                  <p className="text-muted-foreground">Download your results or share them with anyone.</p>
                </div>

                {/* ── Download cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="card-lift cursor-pointer" onClick={handleExportCsv}>
                    <CardContent className="py-6 text-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mx-auto">
                        <FileDown className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold">Download CSV</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Per-page coverage and cost data in spreadsheet format</p>
                      </div>
                      {exportLoading === "csv" ? (
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                      ) : (
                        <Badge variant="secondary" className="text-xs">CSV</Badge>
                      )}
                    </CardContent>
                  </Card>

                  <Card
                    className={cn("card-lift cursor-pointer transition-all", exportLoading === "pdf" && "opacity-70 pointer-events-none")}
                    onClick={handleExportPdf}
                  >
                    <CardContent className="py-6 text-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center mx-auto">
                        {exportLoading === "pdf" ? (
                          <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
                        ) : (
                          <FileDown className="w-6 h-6 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">Download PDF Report</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Branded report with CMYK bars, cost breakdown, and AI recommendations</p>
                      </div>
                      {exportLoading === "pdf" ? (
                        <span className="text-xs text-muted-foreground">Generating…</span>
                      ) : (
                        <Badge variant="secondary" className="text-xs">PDF</Badge>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* ── Share Button ── */}
                <Card className="border-2 border-blue-100 bg-gradient-to-br from-blue-50 to-slate-50">
                  <CardContent className="py-5">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1 text-center sm:text-left">
                        <p className="font-semibold text-slate-800">Share via WhatsApp, Gmail, Telegram & more</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          On mobile, opens your phone's native share sheet with all installed apps
                        </p>
                      </div>
                      <Button
                        className="gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-md shrink-0 px-6"
                        onClick={() => setShowShareModal(true)}
                      >
                        <Share2 className="w-4 h-4" />
                        Share Results
                      </Button>
                    </div>

                    {/* App icons preview */}
                    <div className="flex items-center gap-2 mt-4 flex-wrap">
                      {["💬 WhatsApp", "✉️ Gmail", "✈️ Telegram", "📧 Outlook", "👥 Teams", "☁️ OneDrive", "📦 Dropbox"].map((app) => (
                        <span key={app} className="text-xs bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-600 shadow-sm">
                          {app}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground">+ all apps on your phone</span>
                    </div>
                  </CardContent>
                </Card>

                {isPrivateMode && (
                  <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 text-amber-800">
                        <Lock className="w-4 h-4" />
                        <p className="text-sm font-medium">Private Mode — Link sharing disabled</p>
                      </div>
                      <p className="text-xs text-amber-700 mt-1 ml-6">Your files were processed in-memory only. You can still share the PDF file directly via the Share button above.</p>
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-3 justify-between">
                  <Button variant="outline" onClick={() => setCurrentStep(4)}>
                    ← Back to Results
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCurrentStep(1);
                      setFileItems([]);
                      setSessionId(null);
                      setShareToken(null);
                      setCostResults(null);
                      setShareUrl(null);
                    }}
                  >
                    Start New Analysis
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Ink Assistant Avatar ── */}
      <InkAssistant
        message={assistantMessage}
        showDownloadPrompt={showDownloadPrompt}
        onDownloadPDF={handleExportPdf}
        onDownloadCSV={handleExportCsv}
        step={currentStep}
      />

      {/* ── Add Printer Modal ── */}
      <AddPrinterModal
        open={showAddPrinterForm}
        onClose={() => setShowAddPrinterForm(false)}
        onSave={handleAddCustomPrinter}
        isSaving={addCustomPrinterMutation.isPending}
        initialBrand={activeBrand !== "Custom" ? activeBrand : ""}
      />

      {/* ── Share Modal ── */}
      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareUrl ?? (!isPrivateMode && shareToken ? `${window.location.origin}/share/${shareToken}` : null)}
        shareToken={shareToken}
        onGetPdfBlob={getPdfBlob}
        sessionId={sessionId ? String(sessionId) : null}
      />

      {/* ── Footer ── */}
      <footer className="border-t border-border mt-16 py-8">
        <div className="container text-center">
          <p className="text-xs text-muted-foreground">
            InkCalc — Ink Coverage & Print Cost Calculator &nbsp;·&nbsp; Files auto-deleted after 24 hours &nbsp;·&nbsp;
            <a href="https://www.sctdjm.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-2">
              sctdjm.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
