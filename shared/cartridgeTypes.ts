/**
 * Flexible Cartridge System — shared type definitions
 *
 * A printer can have any number of cartridges. Each cartridge covers one or more
 * ink channels. This model supports:
 *   - 2-cartridge (Black + Tri-colour): e.g. Epson 664B + 664C, HP 63B + 63C
 *   - 4-cartridge (CMYK): e.g. Canon PIXMA Pro, Epson WorkForce
 *   - 6-cartridge (CMYK + Photo): e.g. Canon Pro-100
 *   - Custom: any combination
 */

/** The ink channels we can measure from a page scan */
export type InkChannel = "C" | "M" | "Y" | "K" | "R" | "G" | "B";

/**
 * A single cartridge definition.
 * - `channels`: which ink channels this cartridge covers
 * - `blended`: if true, the cartridge ink is shared equally across all its channels
 *   (e.g. a tri-colour cartridge covers C+M+Y from one reservoir)
 * - `price`: cartridge price in local currency
 * - `yield`: rated page yield at `coveragePercent` reference coverage
 */
export interface CartridgeDef {
  id: string;           // unique within the printer config, e.g. "black", "colour", "cyan"
  label: string;        // display name, e.g. "Black (664B)", "Colour (664C)", "Cyan"
  channels: InkChannel[]; // channels this cartridge covers
  blended: boolean;     // true = one reservoir for all channels (tri-colour)
  price: number;        // price per cartridge ($)
  yield: number;        // page yield at reference coverage
  color: string;        // hex colour for UI display
}

/**
 * Printer type presets — define the cartridge configuration template.
 * Users select a printer type and get the correct cartridge rows automatically.
 */
export type PrinterType =
  | "2-cartridge"    // Black + Tri-colour (most consumer inkjets)
  | "4-cartridge"    // C + M + Y + K (separate CMYK)
  | "6-cartridge"    // C + M + Y + K + Photo-C + Photo-M
  | "1-cartridge"    // Black only (mono laser/inkjet)
  | "custom";        // User-defined

export interface PrinterTypeTemplate {
  type: PrinterType;
  label: string;
  description: string;
  cartridges: Omit<CartridgeDef, "price" | "yield">[];
}

export const PRINTER_TYPE_TEMPLATES: PrinterTypeTemplate[] = [
  {
    type: "2-cartridge",
    label: "2-Cartridge (Black + Colour)",
    description: "Consumer inkjets with one black and one tri-colour cartridge. e.g. Epson 664B/664C, HP 63, Canon PG-245/CL-246",
    cartridges: [
      { id: "black",  label: "Black",  channels: ["K"],           blended: false, color: "#1a1a1a" },
      { id: "colour", label: "Colour", channels: ["C", "M", "Y"], blended: true,  color: "#7c3aed" },
    ],
  },
  {
    type: "4-cartridge",
    label: "4-Cartridge (CMYK)",
    description: "Separate Cyan, Magenta, Yellow and Black cartridges. e.g. Epson WorkForce, Canon PIXMA Pro, HP OfficeJet Pro",
    cartridges: [
      { id: "cyan",    label: "Cyan",    channels: ["C"], blended: false, color: "#06b6d4" },
      { id: "magenta", label: "Magenta", channels: ["M"], blended: false, color: "#ec4899" },
      { id: "yellow",  label: "Yellow",  channels: ["Y"], blended: false, color: "#eab308" },
      { id: "black",   label: "Black",   channels: ["K"], blended: false, color: "#1a1a1a" },
    ],
  },
  {
    type: "6-cartridge",
    label: "6-Cartridge (CMYK + Photo)",
    description: "Professional photo inkjets with additional photo cyan and photo magenta. e.g. Canon Pro-100, Epson R2000",
    cartridges: [
      { id: "cyan",        label: "Cyan",        channels: ["C"], blended: false, color: "#06b6d4" },
      { id: "magenta",     label: "Magenta",      channels: ["M"], blended: false, color: "#ec4899" },
      { id: "yellow",      label: "Yellow",       channels: ["Y"], blended: false, color: "#eab308" },
      { id: "black",       label: "Black",        channels: ["K"], blended: false, color: "#1a1a1a" },
      { id: "photo-cyan",  label: "Photo Cyan",   channels: ["C"], blended: false, color: "#67e8f9" },
      { id: "photo-mag",   label: "Photo Magenta",channels: ["M"], blended: false, color: "#f9a8d4" },
    ],
  },
  {
    type: "1-cartridge",
    label: "1-Cartridge (Black Only)",
    description: "Monochrome printers with a single black cartridge. e.g. HP LaserJet, Brother HL series",
    cartridges: [
      { id: "black", label: "Black", channels: ["K"], blended: false, color: "#1a1a1a" },
    ],
  },
  {
    type: "custom",
    label: "Custom Configuration",
    description: "Define your own cartridge setup for unusual or specialty printers",
    cartridges: [],
  },
];

/** Full cost params using the flexible cartridge system */
export interface FlexCostParams {
  printerType: PrinterType;
  cartridges: CartridgeDef[];
  coveragePercent: number;  // reference coverage % for yield rating (default 5%)
  paperCostPerSheet: number;
  isDuplex: boolean;
  copies: number;
}

/** Cost result for a single page using the flexible system */
export interface FlexPageCostResult {
  pageNumber: number;
  fileId: number;
  // Coverage per channel (from analysis)
  cCoverage: number;
  mCoverage: number;
  yCoverage: number;
  kCoverage: number;
  tac: number;
  // Cost per cartridge (keyed by cartridge id)
  cartridgeCosts: Record<string, number>;
  inkCostPerPage: number;
  paperCostPerPage: number;
  totalCostPerPage: number;
  printerType: PrinterType;
}
