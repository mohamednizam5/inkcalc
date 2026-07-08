import { PDFDocument, rgb, StandardFonts, type RGB } from "pdf-lib";
import Papa from "papaparse";
import { readFileSync } from "fs";
import { join } from "path";
import type { PageCostResult } from "./analysisService";
import type { PageAnalysis, UploadedFile } from "../drizzle/schema";

// SCTDJM logo — load high-res PNG from disk (956×208 px, 4× upscaled for crisp PDF rendering).
// Falls back to the embedded low-res base64 if the file is unavailable.
let LOGO_BYTES: Uint8Array;
try {
  LOGO_BYTES = new Uint8Array(readFileSync(join(__dirname, "assets", "sctdjm_logo_hires.png")));
} catch {
  // Fallback: original low-res base64 (239×52 px)
  const SCTDJM_LOGO_B64_FALLBACK =
  "iVBORw0KGgoAAAANSUhEUgAAAO8AAAA0CAMAAABVV59nAAAB5lBMVEVMaXF/w0YWLVSAw0l8wkN/w0Z/" +
  "w0Z8wkN8wkN/w0aAw0l/w0aAw0l/w0Z/w0Z/w0Z/w0Z/w0Z/w0Z/w0aAw0kWLVR8wkN/w0YWLVR/w0Z8" +
  "wkN/w0Z/w0Z/w0Z8wkN/w0Z/w0YWLVR8wkN/w0aAw0l/w0Z/w0Z/w0Z/w0Z/w0YWLVR8wkN/w0Z/w0Z/" +
  "w0YWLVQWLVR8wkN8wkN8wkN/w0Z/w0Z/w0aAw0mAw0kWLVR8wkN8wkN/w0YWLVQWLVR8wkOAw0kWLVR/" +
  "w0Z/w0Z/w0Z8wkOAw0l/w0Z/w0Z/w0Z/w0Z/w0Z/w0Z/w0YWLVR/w0Z/w0Z/w0aAw0mAw0kWLVSAw0mA" +
  "w0mAw0l/w0Z/w0aAw0mAw0mAw0l/w0aAw0l/w0Z/w0Z/w0aAw0l/w0Z/w0YWLVSAw0mAw0l/w0Z/w0Z/" +
  "w0aAw0mAw0mAw0l/w0aAw0l/w0aAw0iAw0l/w0d/w0aAw0iAw0iAw0mAw0mAw0l/w0Z/w0Z/w0Z/w0Z/" +
  "w0Z/w0Z/w0Z/w0aAw0mAw0mAw0mAw0mAw0mAw0mAw0l/w0aAw0mAw0mAw0l/w0d/w0aAw0mAw0iAw0l/" +
  "w0aAw0mAw0mAw0l/w0Z/w0aAw0mAw0l/w0aAw0mAw0iAw0l8wkN/w0YWLVSAw0ndpb9aAAAAnnRSTlMA" +
  "IMBAgBAwwEBA4JCAoOC4+Jhq3KAQENDw2PDE+bKg4oJgUFDQrKXyYPDQYHnU5XAg0CDgiM6eECCAcDCA" +
  "4KCQMLBbyeiwUHT3cO76i/NQvtN+v9SQkIhwl/ummHmmYGaU7Kzf5kDu+j3tLrjc2P78/FjlcFhkiMzT" +
  "9spkPOpMwY+14vSl8MTOPc+C7LpY1vkf5vbz/Yv165e1zPdw8gRomy8AAAAJcEhZcwAACxIAAAsSAdLd" +
  "fvwAAAlgSURBVGiB7Zj3V9vYEsdHGIkIdxtwjDE4gI1NT6gpJLQQICSkl82mZ3vft7uv9957f89f3f/0" +
  "nbmSZUmWsUhCTvJO5gcspJl753PvzNxCXulueOOVQy3kmJ/RyT1talqtmm6w6PH71lP74OuJW44bU3t8" +
  "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" +
  "0PnpcQ0f8AkZXFJt6QED8AAAAASUVORK5CYII=";
  LOGO_BYTES = new Uint8Array(Buffer.from(SCTDJM_LOGO_B64_FALLBACK, "base64"));
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

export function generateCsv(
  pages: PageAnalysis[],
  files: UploadedFile[],
  costResults?: PageCostResult[]
): string {
  const fileMap = new Map(files.map((f) => [f.id, f.filename]));

  const rows = pages.map((p) => {
    const cost = costResults?.find((c) => c.fileId === p.fileId && c.pageNumber === p.pageNumber);
    return {
      File: fileMap.get(p.fileId) ?? `File ${p.fileId}`,
      Page: p.pageNumber,
      "Cyan Coverage (%)": (p.cCoverage ?? 0).toFixed(4),
      "Magenta Coverage (%)": (p.mCoverage ?? 0).toFixed(4),
      "Yellow Coverage (%)": (p.yCoverage ?? 0).toFixed(4),
      "Black Coverage (%)": (p.kCoverage ?? 0).toFixed(4),
      "TAC (%)": (p.tac ?? 0).toFixed(4),
      "Cyan Ink Cost ($)": cost ? (cost.cCost ?? 0).toFixed(4) : "",
      "Magenta Ink Cost ($)": cost ? (cost.mCost ?? 0).toFixed(4) : "",
      "Yellow Ink Cost ($)": cost ? (cost.yCost ?? 0).toFixed(4) : "",
      "Black Ink Cost ($)": cost ? (cost.kCost ?? 0).toFixed(4) : "",
      "Total Ink Cost ($)": cost ? cost.inkCostPerPage.toFixed(4) : "",
      "Paper Cost ($)": cost ? cost.paperCostPerPage.toFixed(4) : "",
      "Total Cost ($)": cost ? cost.totalCostPerPage.toFixed(4) : "",
    };
  });

  return Papa.unparse(rows);
}

// ─── PDF Report Export ────────────────────────────────────────────────────────

const PAGE_W = 595.28; // A4 width  (pts)
const PAGE_H = 841.89; // A4 height (pts)
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Brand colours
const C_NAVY   = rgb(0.07, 0.09, 0.20);
const C_ACCENT = rgb(0.18, 0.42, 0.88);
const C_LIGHT  = rgb(0.95, 0.96, 0.99);
const C_BORDER = rgb(0.82, 0.85, 0.92);
const C_TEXT   = rgb(0.12, 0.14, 0.20);
const C_MUTED  = rgb(0.45, 0.48, 0.56);
const C_WHITE  = rgb(1, 1, 1);

// CMYK channel colours
const C_CYAN    = rgb(0.02, 0.71, 0.84);
const C_MAGENTA = rgb(0.93, 0.28, 0.60);
const C_YELLOW  = rgb(0.92, 0.71, 0.03);
const C_BLACK   = rgb(0.18, 0.20, 0.25);

function clamp(v: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

export async function generatePdfReport(options: {
  pages: PageAnalysis[];
  files: UploadedFile[];
  costResults?: PageCostResult[];
  totalCost?: number;
  totalInkCost?: number;
  totalPaperCost?: number;
  copies?: number;
  aiSummary?: string;
  aiRecommendations?: string[];
}): Promise<Buffer> {
  const {
    pages, files, costResults,
    totalCost, totalInkCost, totalPaperCost,
    copies, aiSummary, aiRecommendations,
  } = options;

  const pdfDoc = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // Embed the SCTDJM logo (always available as inline base64 constant)
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  try {
    logoImage = await pdfDoc.embedPng(LOGO_BYTES);
  } catch {
    logoImage = null; // fallback to text branding if embedding fails
  }

  // ── Page management ──────────────────────────────────────────────────────────
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 40; // top margin after header space
  };

  const ensureSpace = (needed: number) => {
    if (y < MARGIN + needed) newPage();
  };

  // ── Text helpers ─────────────────────────────────────────────────────────────
  const text = (
    str: string, x: number, yPos: number,
    { size = 9, bold = false, italic = false, color = C_TEXT, maxWidth = 0 }: {
      size?: number; bold?: boolean; italic?: boolean; color?: RGB; maxWidth?: number;
    } = {}
  ) => {
    const f = bold ? boldFont : italic ? italFont : font;
    if (maxWidth > 0) {
      // word-wrap
      const words = str.split(" ");
      let line = "";
      let cy = yPos;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        const testW = f.widthOfTextAtSize(test, size);
        if (testW > maxWidth && line) {
          page.drawText(line, { x, y: cy, size, font: f, color });
          cy -= size * 1.5;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) page.drawText(line, { x, y: cy, size, font: f, color });
      return yPos - cy + size * 1.5; // height consumed
    }
    page.drawText(str, { x, y: yPos, size, font: f, color });
    return size * 1.5;
  };

  // ── Drawing primitives ───────────────────────────────────────────────────────
  const rect = (x: number, yPos: number, w: number, h: number, color: RGB, borderColor?: RGB) => {
    page.drawRectangle({ x, y: yPos, width: w, height: h, color });
    if (borderColor) {
      page.drawRectangle({ x, y: yPos, width: w, height: h, borderColor, borderWidth: 0.5, color: undefined as any });
    }
  };

  const hLine = (yPos: number, color = C_BORDER, thickness = 0.5) => {
    page.drawLine({ start: { x: MARGIN, y: yPos }, end: { x: PAGE_W - MARGIN, y: yPos }, thickness, color });
  };

  // ── Horizontal bar (for CMYK coverage) ──────────────────────────────────────
  const drawBar = (x: number, yPos: number, w: number, h: number, pct: number, barColor: RGB) => {
    rect(x, yPos, w, h, C_LIGHT);
    const fill = clamp(pct) / 100 * w;
    if (fill > 0) rect(x, yPos, fill, h, barColor);
    page.drawRectangle({ x, y: yPos, width: w, height: h, borderColor: C_BORDER, borderWidth: 0.4, color: undefined as any });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER / HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  // Dark header band
  rect(0, PAGE_H - 110, PAGE_W, 110, C_NAVY);
  // Accent stripe
  rect(0, PAGE_H - 113, PAGE_W, 3, C_ACCENT);

  // Draw SCTDJM logo in the top-right corner of the header band
  // scaleToFit preserves aspect ratio; 160×44 pt gives a crisp render with the 4× hi-res PNG
  if (logoImage) {
    const logoDims = logoImage.scaleToFit(160, 44);
    page.drawImage(logoImage, {
      x: PAGE_W - MARGIN - logoDims.width,
      y: PAGE_H - MARGIN - logoDims.height + 6,
      width: logoDims.width,
      height: logoDims.height,
    });
  } else {
    // Fallback text branding when logo is unavailable
    text("SCTD", PAGE_W - MARGIN - 60, PAGE_H - 44, { size: 14, bold: true, color: C_WHITE });
  }

  text("Ink Coverage & Print Cost Report", MARGIN, PAGE_H - 48, { size: 22, bold: true, color: C_WHITE });
  text("Generated by InkCalc — Sterling Carter Technology Distributors", MARGIN, PAGE_H - 68, { size: 9, color: rgb(0.7, 0.75, 0.88) });
  text(`Report date: ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`, MARGIN, PAGE_H - 84, { size: 8, color: rgb(0.6, 0.65, 0.78) });
  text(`www.sctdjm.com`, PAGE_W - MARGIN - 90, PAGE_H - 84, { size: 8, color: rgb(0.5, 0.55, 0.70) });

  y = PAGE_H - 130;

  // ── Summary stats row ────────────────────────────────────────────────────────
  const fileMap = new Map(files.map((f) => [f.id, f.filename]));
  const totalPagesCount = pages.length;
  const avgTac = pages.reduce((s, p) => s + (p.tac ?? 0), 0) / (totalPagesCount || 1);
  const avgC   = pages.reduce((s, p) => s + (p.cCoverage ?? 0), 0) / (totalPagesCount || 1);
  const avgM   = pages.reduce((s, p) => s + (p.mCoverage ?? 0), 0) / (totalPagesCount || 1);
  const avgY   = pages.reduce((s, p) => s + (p.yCoverage ?? 0), 0) / (totalPagesCount || 1);
  const avgK   = pages.reduce((s, p) => s + (p.kCoverage ?? 0), 0) / (totalPagesCount || 1);

  const statCards = [
    { label: "Files",       value: String(files.length) },
    { label: "Pages",       value: String(totalPagesCount) },
    { label: "Avg TAC",     value: `${avgTac.toFixed(1)}%` },
    { label: "Total Cost",  value: totalCost !== undefined ? `$${totalCost.toFixed(2)}` : "—" },
  ];
  const cardW = (CONTENT_W - 12) / 4;
  statCards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 4);
    rect(cx, y - 52, cardW, 52, C_LIGHT, C_BORDER);
    text(card.value, cx + 8, y - 22, { size: 16, bold: true, color: C_ACCENT });
    text(card.label, cx + 8, y - 38, { size: 8, color: C_MUTED });
  });
  y -= 68;

  // ── CMYK Average Coverage section ────────────────────────────────────────────
  ensureSpace(120);
  text("Average CMYK Coverage", MARGIN, y, { size: 11, bold: true });
  y -= 16;
  hLine(y + 4);
  y -= 10;

  const channels: Array<{ label: string; value: number; color: RGB }> = [
    { label: "Cyan",    value: avgC, color: C_CYAN },
    { label: "Magenta", value: avgM, color: C_MAGENTA },
    { label: "Yellow",  value: avgY, color: C_YELLOW },
    { label: "Black",   value: avgK, color: C_BLACK },
  ];

  const barH = 12;
  const barLabelW = 52;
  const barPctW = 36;
  const barTrackW = CONTENT_W - barLabelW - barPctW - 8;

  for (const ch of channels) {
    ensureSpace(barH + 8);
    text(ch.label, MARGIN, y, { size: 8, bold: true, color: C_TEXT });
    drawBar(MARGIN + barLabelW, y - barH + 2, barTrackW, barH, ch.value, ch.color);
    text(`${ch.value.toFixed(2)}%`, MARGIN + barLabelW + barTrackW + 6, y, { size: 8, color: C_MUTED });
    y -= barH + 6;
  }
  // TAC row
  ensureSpace(barH + 8);
  text("TAC", MARGIN, y, { size: 8, bold: true, color: C_TEXT });
  drawBar(MARGIN + barLabelW, y - barH + 2, barTrackW, barH, avgTac, C_ACCENT);
  text(`${avgTac.toFixed(2)}%`, MARGIN + barLabelW + barTrackW + 6, y, { size: 8, color: C_MUTED });
  y -= barH + 14;

  // ── Cost Summary box ─────────────────────────────────────────────────────────
  if (totalCost !== undefined) {
    ensureSpace(90);
    rect(MARGIN, y - 76, CONTENT_W, 76, C_LIGHT, C_BORDER);
    // left accent bar
    rect(MARGIN, y - 76, 4, 76, C_ACCENT);

    text("Cost Summary", MARGIN + 14, y - 12, { size: 10, bold: true });
    const costRows = [
      ["Total Ink Cost",   `$${(totalInkCost ?? 0).toFixed(4)}`],
      ["Total Paper Cost", `$${(totalPaperCost ?? 0).toFixed(4)}`],
      ["Total Job Cost",   `$${totalCost.toFixed(4)}`],
    ];
    if (copies && copies > 1) {
      costRows.push(["Copies", String(copies)]);
      costRows.push(["Cost per Copy", `$${(totalCost / copies).toFixed(4)}`]);
    }
    const halfW = CONTENT_W / 2 - 20;
    costRows.forEach((row, i) => {
      const col = i % 2;
      const rowY = y - 28 - Math.floor(i / 2) * 16;
      const cx = MARGIN + 14 + col * (halfW + 20);
      text(`${row[0]}:`, cx, rowY, { size: 8, color: C_MUTED });
      text(row[1], cx + 100, rowY, { size: 8, bold: true });
    });
    y -= 92;
  }

  // ── AI Summary ───────────────────────────────────────────────────────────────
  if (aiSummary) {
    ensureSpace(60);
    text("AI Analysis & Recommendations", MARGIN, y, { size: 11, bold: true });
    y -= 16;
    hLine(y + 4);
    y -= 10;

    const summaryHeight = text(aiSummary, MARGIN, y, { size: 8.5, italic: true, color: C_TEXT, maxWidth: CONTENT_W });
    y -= summaryHeight + 8;

    if (aiRecommendations?.length) {
      ensureSpace(20);
      text("Recommendations:", MARGIN, y, { size: 9, bold: true });
      y -= 14;
      for (const rec of aiRecommendations) {
        ensureSpace(20);
        // bullet
        rect(MARGIN, y - 5, 4, 4, C_ACCENT);
        const recH = text(rec, MARGIN + 10, y, { size: 8, color: C_TEXT, maxWidth: CONTENT_W - 10 });
        y -= recH + 6;
      }
    }
    y -= 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PER-PAGE TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  ensureSpace(60);
  text("Per-Page Coverage & Cost Breakdown", MARGIN, y, { size: 11, bold: true });
  y -= 16;
  hLine(y + 4);
  y -= 6;

  // Column layout: File/Page | C% | M% | Y% | K% | TAC% | C$ | M$ | Y$ | K$ | Paper$ | Total$
  const COL = {
    file:   MARGIN,
    c:      MARGIN + 110,
    m:      MARGIN + 143,
    yy:     MARGIN + 176,
    k:      MARGIN + 209,
    tac:    MARGIN + 242,
    cCost:  MARGIN + 278,
    mCost:  MARGIN + 313,
    yCost:  MARGIN + 348,
    kCost:  MARGIN + 383,
    paper:  MARGIN + 418,
    total:  MARGIN + 458,
  };

  // Table header
  const TH_H = 16;
  rect(MARGIN, y - TH_H, CONTENT_W, TH_H, C_NAVY);
  const headers: Array<[string, number]> = [
    ["File / Page", COL.file],
    ["C%",    COL.c],
    ["M%",    COL.m],
    ["Y%",    COL.yy],
    ["K%",    COL.k],
    ["TAC%",  COL.tac],
    ["C $",   COL.cCost],
    ["M $",   COL.mCost],
    ["Y $",   COL.yCost],
    ["K $",   COL.kCost],
    ["Paper$",COL.paper],
    ["Total$",COL.total],
  ];
  headers.forEach(([h, x]) => text(h, x + 2, y - TH_H + 5, { size: 6.5, bold: true, color: C_WHITE }));
  y -= TH_H + 2;

  let rowIdx = 0;
  for (const p of pages) {
    ensureSpace(14);
    const rowH = 13;
    const bg = rowIdx % 2 === 0 ? C_WHITE : C_LIGHT;
    rect(MARGIN, y - rowH, CONTENT_W, rowH, bg);

    const cost = costResults?.find((c) => c.fileId === p.fileId && c.pageNumber === p.pageNumber);
    const fileName = (fileMap.get(p.fileId) ?? `File ${p.fileId}`).replace(/\.[^.]+$/, "").substring(0, 14);

    const rowData: Array<[string, number, RGB?]> = [
      [`${fileName} / p${p.pageNumber}`, COL.file],
      [(p.cCoverage ?? 0).toFixed(1), COL.c,  C_CYAN],
      [(p.mCoverage ?? 0).toFixed(1), COL.m,  C_MAGENTA],
      [(p.yCoverage ?? 0).toFixed(1), COL.yy, rgb(0.65, 0.50, 0.02)],
      [(p.kCoverage ?? 0).toFixed(1), COL.k,  C_BLACK],
      [(p.tac ?? 0).toFixed(1),       COL.tac, C_ACCENT],
      [cost ? `$${(cost.cCost ?? 0).toFixed(3)}` : "—", COL.cCost, C_CYAN],
      [cost ? `$${(cost.mCost ?? 0).toFixed(3)}` : "—", COL.mCost, C_MAGENTA],
      [cost ? `$${(cost.yCost ?? 0).toFixed(3)}` : "—", COL.yCost, rgb(0.65, 0.50, 0.02)],
      [cost ? `$${(cost.kCost ?? 0).toFixed(3)}` : "—", COL.kCost, C_BLACK],
      [cost ? `$${cost.paperCostPerPage.toFixed(3)}` : "—", COL.paper],
      [cost ? `$${cost.totalCostPerPage.toFixed(3)}` : "—", COL.total, C_ACCENT],
    ];

    rowData.forEach(([val, x, color]) => {
      text(val, x + 2, y - rowH + 4, { size: 6.5, color: color ?? C_TEXT });
    });

    y -= rowH;
    rowIdx++;
  }

  // Bottom border of table
  hLine(y - 1);
  y -= 12;

  // ── Totals row (if cost data present) ────────────────────────────────────────
  if (costResults && costResults.length > 0) {
    ensureSpace(18);
    const totalCCost  = costResults.reduce((s, r) => s + (r.cCost ?? 0), 0);
    const totalMCost  = costResults.reduce((s, r) => s + (r.mCost ?? 0), 0);
    const totalYCost  = costResults.reduce((s, r) => s + (r.yCost ?? 0), 0);
    const totalKCost  = costResults.reduce((s, r) => s + (r.kCost ?? 0), 0);
    const totalPaper  = costResults.reduce((s, r) => s + r.paperCostPerPage, 0);
    const grandTotal  = costResults.reduce((s, r) => s + r.totalCostPerPage, 0);

    rect(MARGIN, y - 16, CONTENT_W, 16, C_LIGHT, C_BORDER);
    text("TOTALS", COL.file + 2, y - 11, { size: 6.5, bold: true });
    text(`$${totalCCost.toFixed(3)}`,  COL.cCost + 2, y - 11, { size: 6.5, bold: true, color: C_CYAN });
    text(`$${totalMCost.toFixed(3)}`,  COL.mCost + 2, y - 11, { size: 6.5, bold: true, color: C_MAGENTA });
    text(`$${totalYCost.toFixed(3)}`,  COL.yCost + 2, y - 11, { size: 6.5, bold: true, color: rgb(0.65, 0.50, 0.02) });
    text(`$${totalKCost.toFixed(3)}`,  COL.kCost + 2, y - 11, { size: 6.5, bold: true, color: C_BLACK });
    text(`$${totalPaper.toFixed(3)}`,  COL.paper + 2, y - 11, { size: 6.5, bold: true, color: C_ACCENT });
    text(`$${grandTotal.toFixed(3)}`,  COL.total + 2, y - 11, { size: 6.5, bold: true, color: C_ACCENT });
    y -= 24;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER on every page
  // ═══════════════════════════════════════════════════════════════════════════
  const allPages = pdfDoc.getPages();
  const total = allPages.length;
  for (let i = 0; i < total; i++) {
    const pg = allPages[i];
    // footer line
    pg.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_W - MARGIN, y: 30 }, thickness: 0.4, color: C_BORDER });
    pg.drawText(
      `InkCalc — Ink Coverage & Print Cost Calculator  ·  www.sctdjm.com  ·  Page ${i + 1} of ${total}`,
      { x: MARGIN, y: 16, size: 6.5, font, color: C_MUTED }
    );
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
