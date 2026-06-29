import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Printer, ChevronRight, ChevronLeft, Loader2, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomPrinterData {
  brand: string;
  series: string;
  model: string;
  cartridgeModel: string;
  cartridgeType: "Inkjet" | "Laser";
  // Per-channel
  cCartridgePrice: string;
  cCartridgeYield: string;
  mCartridgePrice: string;
  mCartridgeYield: string;
  yCartridgePrice: string;
  yCartridgeYield: string;
  kCartridgePrice: string;
  kCartridgeYield: string;
  // Shared / fallback
  pricePerCartridge: string;
  yieldPages: string;
  coveragePercent: string;
  // Ink volume (optional)
  pricePerMl: string;
  mlPerCartridge: string;
}

export const EMPTY_CUSTOM_PRINTER: CustomPrinterData = {
  brand: "", series: "", model: "", cartridgeModel: "", cartridgeType: "Inkjet",
  cCartridgePrice: "", cCartridgeYield: "",
  mCartridgePrice: "", mCartridgeYield: "",
  yCartridgePrice: "", yCartridgeYield: "",
  kCartridgePrice: "", kCartridgeYield: "",
  pricePerCartridge: "", yieldPages: "", coveragePercent: "5",
  pricePerMl: "", mlPerCartridge: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: CustomPrinterData) => Promise<void>;
  isSaving: boolean;
  initialBrand?: string;
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Printer Info",   desc: "Brand, model & cartridge" },
  { id: 2, label: "CMYK Yields",    desc: "Per-channel pricing" },
  { id: 3, label: "Shared Pricing", desc: "Fallback & ink volume" },
];

const CHANNEL_CONFIG = [
  { key: "c" as const, label: "Cyan",    color: "#06b6d4", bg: "bg-cyan-50",    border: "border-cyan-200",    text: "text-cyan-700"    },
  { key: "m" as const, label: "Magenta", color: "#ec4899", bg: "bg-pink-50",    border: "border-pink-200",    text: "text-pink-700"    },
  { key: "y" as const, label: "Yellow",  color: "#ca8a04", bg: "bg-yellow-50",  border: "border-yellow-200",  text: "text-yellow-700"  },
  { key: "k" as const, label: "Black",   color: "#1f2937", bg: "bg-gray-50",    border: "border-gray-200",    text: "text-gray-700"    },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AddPrinterModal({ open, onClose, onSave, isSaving, initialBrand = "" }: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<CustomPrinterData>({ ...EMPTY_CUSTOM_PRINTER, brand: initialBrand });
  const [errors, setErrors] = useState<Partial<Record<keyof CustomPrinterData, string>>>({});

  const set = (field: keyof CustomPrinterData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateStep1 = () => {
    const errs: typeof errors = {};
    if (!data.brand.trim()) errs.brand = "Brand is required";
    if (!data.model.trim()) errs.model = "Model name is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep3 = () => {
    const errs: typeof errors = {};
    // At least one pricing method must be provided
    const hasCmyk = data.cCartridgePrice || data.mCartridgePrice || data.yCartridgePrice || data.kCartridgePrice;
    const hasShared = data.pricePerCartridge;
    const hasMl = data.pricePerMl && data.mlPerCartridge;
    if (!hasCmyk && !hasShared && !hasMl) {
      errs.pricePerCartridge = "Provide at least one pricing method";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    setStep((s) => Math.min(s + 1, 3) as 1 | 2 | 3);
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3);

  const handleSave = async () => {
    if (!validateStep3()) return;
    await onSave(data);
    // Reset on success
    setStep(1);
    setData({ ...EMPTY_CUSTOM_PRINTER, brand: initialBrand });
    setErrors({});
  };

  const handleClose = () => {
    onClose();
    setStep(1);
    setData({ ...EMPTY_CUSTOM_PRINTER, brand: initialBrand });
    setErrors({});
  };

  // ── Progress summary ────────────────────────────────────────────────────────
  const filledChannels = CHANNEL_CONFIG.filter(
    (ch) => data[`${ch.key}CartridgePrice` as keyof CustomPrinterData] || data[`${ch.key}CartridgeYield` as keyof CustomPrinterData]
  );

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl border border-border pointer-events-auto flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Printer className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">Add Your Printer</h2>
                    <p className="text-xs text-muted-foreground">Enter printer details to auto-fill pricing</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Step progress ── */}
              <div className="px-6 py-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-0">
                  {STEPS.map((s, i) => (
                    <div key={s.id} className="flex items-center flex-1">
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                            step > s.id
                              ? "bg-green-500 text-white"
                              : step === s.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {step > s.id ? <CheckCircle2 className="w-4 h-4" /> : s.id}
                        </div>
                        <div className="text-center">
                          <p className={cn("text-[11px] font-semibold", step === s.id ? "text-foreground" : "text-muted-foreground")}>{s.label}</p>
                          <p className="text-[10px] text-muted-foreground hidden sm:block">{s.desc}</p>
                        </div>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={cn("h-0.5 flex-1 mx-2 rounded transition-all", step > s.id ? "bg-green-400" : "bg-border")} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Body (scrollable) ── */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <AnimatePresence mode="wait">
                  {/* ── Step 1: Printer Info ── */}
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-700">
                          Enter your printer's brand and model name. The cartridge model (e.g. <strong>HP 910XL</strong>, <strong>TK-5242K</strong>) helps identify the correct consumable.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Brand */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">
                            Brand <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            placeholder="e.g. HP, Canon, Epson"
                            value={data.brand}
                            onChange={(e) => set("brand", e.target.value)}
                            className={cn(errors.brand && "border-destructive focus-visible:ring-destructive")}
                          />
                          {errors.brand && <p className="text-xs text-destructive">{errors.brand}</p>}
                        </div>

                        {/* Model */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">
                            Model Name <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            placeholder="e.g. HP OfficeJet Pro 9015e"
                            value={data.model}
                            onChange={(e) => set("model", e.target.value)}
                            className={cn(errors.model && "border-destructive focus-visible:ring-destructive")}
                          />
                          {errors.model && <p className="text-xs text-destructive">{errors.model}</p>}
                        </div>

                        {/* Series */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">
                            Series <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                          </Label>
                          <Input
                            placeholder="e.g. OfficeJet Pro, LaserJet"
                            value={data.series}
                            onChange={(e) => set("series", e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">Used to group printers in the list</p>
                        </div>

                        {/* Cartridge Model */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">
                            Cartridge Model <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                          </Label>
                          <Input
                            placeholder="e.g. HP 910XL, TK-5242K"
                            value={data.cartridgeModel}
                            onChange={(e) => set("cartridgeModel", e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">Shown in the confirmation banner when loaded</p>
                        </div>
                      </div>

                      {/* Cartridge Type */}
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Cartridge Type</Label>
                        <div className="flex gap-3">
                          {(["Inkjet", "Laser"] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => set("cartridgeType", type)}
                              className={cn(
                                "flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all",
                                data.cartridgeType === type
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40"
                              )}
                            >
                              {type === "Inkjet" ? "🖨️ Inkjet" : "⚡ Laser / Toner"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 2: CMYK Yields ── */}
                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4"
                    >
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-700">
                          Enter the price and page yield for each individual colour cartridge. For mono printers, only fill in <strong>Black (K)</strong>. You can skip this step and use shared pricing instead.
                        </p>
                      </div>

                      <div className="space-y-3">
                        {CHANNEL_CONFIG.map((ch) => (
                          <div
                            key={ch.key}
                            className={cn("rounded-xl border p-4 space-y-3", ch.border, ch.bg)}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: ch.color }} />
                              <span className={cn("text-sm font-bold", ch.text)}>{ch.label}</span>
                              {(data[`${ch.key}CartridgePrice` as keyof CustomPrinterData] || data[`${ch.key}CartridgeYield` as keyof CustomPrinterData]) && (
                                <Badge variant="secondary" className="text-[10px] ml-auto">Filled</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Price per Cartridge ($)</Label>
                                <Input
                                  type="number" min="0" step="0.01"
                                  placeholder="e.g. 19.99"
                                  value={data[`${ch.key}CartridgePrice` as keyof CustomPrinterData]}
                                  onChange={(e) => set(`${ch.key}CartridgePrice` as keyof CustomPrinterData, e.target.value)}
                                  className="bg-white/80"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Page Yield</Label>
                                <Input
                                  type="number" min="1"
                                  placeholder="e.g. 300"
                                  value={data[`${ch.key}CartridgeYield` as keyof CustomPrinterData]}
                                  onChange={(e) => set(`${ch.key}CartridgeYield` as keyof CustomPrinterData, e.target.value)}
                                  className="bg-white/80"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {filledChannels.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>
                            {filledChannels.map((c) => c.label).join(", ")} filled — these will be used for per-channel cost calculations.
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 3: Shared Pricing ── */}
                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-700">
                          Shared pricing is used as a fallback when per-channel prices are not set, or for mono printers. <strong>At least one pricing method is required.</strong>
                        </p>
                      </div>

                      {/* Shared cartridge pricing */}
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shared / Fallback Cartridge Pricing</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-sm">Price per Cartridge ($)</Label>
                            <Input
                              type="number" min="0" step="0.01"
                              placeholder="e.g. 45.00"
                              value={data.pricePerCartridge}
                              onChange={(e) => set("pricePerCartridge", e.target.value)}
                              className={cn(errors.pricePerCartridge && "border-destructive")}
                            />
                            {errors.pricePerCartridge && (
                              <p className="text-xs text-destructive">{errors.pricePerCartridge}</p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm">Page Yield</Label>
                            <Input
                              type="number" min="1"
                              placeholder="e.g. 2000"
                              value={data.yieldPages}
                              onChange={(e) => set("yieldPages", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm">Yield at Coverage (%)</Label>
                            <Input
                              type="number" min="1" max="100" step="0.5"
                              placeholder="5"
                              value={data.coveragePercent}
                              onChange={(e) => set("coveragePercent", e.target.value)}
                            />
                            <p className="text-[11px] text-muted-foreground">Manufacturer spec is usually 5%</p>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Ink volume pricing */}
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Ink Volume Pricing <span className="normal-case font-normal">(alternative to cartridge price)</span>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-sm">Price per mL ($)</Label>
                            <Input
                              type="number" min="0" step="0.001"
                              placeholder="e.g. 0.05"
                              value={data.pricePerMl}
                              onChange={(e) => set("pricePerMl", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm">mL per Cartridge</Label>
                            <Input
                              type="number" min="0" step="0.1"
                              placeholder="e.g. 70"
                              value={data.mlPerCartridge}
                              onChange={(e) => set("mlPerCartridge", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Summary card */}
                      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Summary</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <span className="text-muted-foreground">Printer:</span>
                          <span className="font-medium truncate">{data.brand} {data.model || "—"}</span>
                          {data.cartridgeModel && (
                            <>
                              <span className="text-muted-foreground">Cartridge:</span>
                              <span className="font-medium">{data.cartridgeModel}</span>
                            </>
                          )}
                          <span className="text-muted-foreground">Type:</span>
                          <span className="font-medium">{data.cartridgeType}</span>
                          <span className="text-muted-foreground">Channels filled:</span>
                          <span className="font-medium">
                            {filledChannels.length > 0
                              ? filledChannels.map((c) => c.label).join(", ")
                              : "None (shared pricing only)"}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ── */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border flex-shrink-0 bg-muted/20">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={step === 1 ? handleClose : handleBack}
                  disabled={isSaving}
                >
                  {step === 1 ? (
                    "Cancel"
                  ) : (
                    <><ChevronLeft className="w-4 h-4 mr-1" /> Back</>
                  )}
                </Button>

                <div className="flex items-center gap-2">
                  {/* Step dots */}
                  <div className="flex gap-1.5 mr-2">
                    {STEPS.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full transition-all",
                          step === s.id ? "bg-primary w-4" : step > s.id ? "bg-green-400" : "bg-border"
                        )}
                      />
                    ))}
                  </div>

                  {step < 3 ? (
                    <Button size="sm" onClick={handleNext}>
                      Next <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4 mr-2" /> Save &amp; Apply Printer</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
