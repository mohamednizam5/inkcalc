import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { storagePut } from "./storage";

import {
  savePageAnalysis,
  updateSessionStatus,
  updateFilePageCount,
  createUploadedFile,
  saveAiSummary,
  getPageAnalysesBySession,
  getFilesBySession,
} from "./db";
import { invokeLLM, type Message } from "./_core/llm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

const PYTHON = "python3";
const RASTERIZE_SCRIPT = path.join(__dirname, "rasterize.py");
const ANALYZE_SCRIPT = path.join(__dirname, "analyze_cmyk.py");

// ─── Rasterize a file into per-page PNG images ────────────────────────────────

export async function rasterizeFile(
  filePath: string,
  outputDir: string,
  dpi = 150
): Promise<Array<{ page: number; path: string; cmyk_channels?: { C: string; M: string; Y: string; K: string } }>> {
  const { stdout } = await execFileAsync(PYTHON, [RASTERIZE_SCRIPT, filePath, outputDir, String(dpi)], {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  const result = JSON.parse(stdout.trim());
  if (result.error) throw new Error(result.error);
  if (!Array.isArray(result)) throw new Error("Unexpected rasterizer output");
  return result;
}

// ─── Analyze a single image for CMYK coverage ────────────────────────────────

export interface CmykResult {
  cCoverage: number;
  mCoverage: number;
  yCoverage: number;
  kCoverage: number;
  tac: number;
  totalPixels: number;
  inkPixels: number;
}

export async function analyzeCmyk(
  imagePath: string,
  cmykChannels?: { C: string; M: string; Y: string; K: string }
): Promise<CmykResult> {
  // If native CMYK channel files are available, pass them as JSON for accurate analysis
  const arg = cmykChannels
    ? JSON.stringify({ path: imagePath, cmyk_channels: cmykChannels })
    : imagePath;
  const { stdout } = await execFileAsync(PYTHON, [ANALYZE_SCRIPT, arg], {
    timeout: 60_000,
    maxBuffer: 5 * 1024 * 1024,
  });

  const result = JSON.parse(stdout.trim());
  if (result.error) throw new Error(result.error);
  return result as CmykResult;
}

// ─── Generate thumbnail ───────────────────────────────────────────────────────

export async function generateThumbnail(imagePath: string): Promise<Buffer> {
  return sharp(imagePath)
    .resize(300, 400, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

// ─── Full processing pipeline for a session ──────────────────────────────────

export async function processSession(
  sessionId: number,
  files: Array<{ buffer: Buffer; filename: string; mimeType: string }>,
  mode: "standard" | "private"
): Promise<void> {
  await updateSessionStatus(sessionId, "processing");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ink-session-${sessionId}-`));

  try {
    for (const file of files) {
      // Write file to temp dir
      const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(tmpDir, safeName);
      fs.writeFileSync(filePath, file.buffer);

      // Store file in S3 (unless private mode)
      let storageKey: string | undefined;
      if (mode === "standard") {
        const { key } = await storagePut(
          `sessions/${sessionId}/${safeName}`,
          file.buffer,
          file.mimeType
        );
        storageKey = key;
      }

      // Create DB record
      const fileId = await createUploadedFile({
        sessionId,
        filename: file.filename,
        mimeType: file.mimeType,
        storageKey,
        fileSize: file.buffer.length,
      });

      // Rasterize
      const pageDir = path.join(tmpDir, `file-${fileId}`);
      fs.mkdirSync(pageDir, { recursive: true });

      let pages: Array<{ page: number; path: string }>;
      try {
        pages = await rasterizeFile(filePath, pageDir);
      } catch (err) {
        console.error(`[Analysis] Rasterization failed for ${file.filename}:`, err);
        continue;
      }

      await updateFilePageCount(fileId, pages.length);

      // Analyze each page
      for (const pageInfo of pages) {
        try {
          const cmyk = await analyzeCmyk(pageInfo.path, (pageInfo as any).cmyk_channels);

          // Generate and store thumbnail
          let thumbnailKey: string | undefined;
          if (mode === "standard") {
            try {
              const thumbBuffer = await generateThumbnail(pageInfo.path);
              const { key } = await storagePut(
                `sessions/${sessionId}/thumbs/file-${fileId}-page-${pageInfo.page}.jpg`,
                thumbBuffer,
                "image/jpeg"
              );
              thumbnailKey = key;
            } catch (thumbErr) {
              console.warn("[Analysis] Thumbnail generation failed:", thumbErr);
            }
          }

          await savePageAnalysis({
            fileId,
            sessionId,
            pageNumber: pageInfo.page,
            ...cmyk,
            thumbnailKey,
          });
        } catch (pageErr) {
          console.error(`[Analysis] Page ${pageInfo.page} analysis failed:`, pageErr);
        }
      }
    }

    await updateSessionStatus(sessionId, "complete");

    // Generate AI summary asynchronously (don't block completion)
    generateAiSummaryForSession(sessionId).catch((err) =>
      console.error("[Analysis] AI summary failed:", err)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateSessionStatus(sessionId, "error", msg);
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

// ─── LLM Summary Generation ───────────────────────────────────────────────────

export async function generateAiSummaryForSession(sessionId: number): Promise<void> {
  const pages = await getPageAnalysesBySession(sessionId);
  const files = await getFilesBySession(sessionId);

  if (pages.length === 0) return;

  const totalPages = pages.length;
  const avgC = pages.reduce((s, p) => s + (p.cCoverage ?? 0), 0) / totalPages;
  const avgM = pages.reduce((s, p) => s + (p.mCoverage ?? 0), 0) / totalPages;
  const avgY = pages.reduce((s, p) => s + (p.yCoverage ?? 0), 0) / totalPages;
  const avgK = pages.reduce((s, p) => s + (p.kCoverage ?? 0), 0) / totalPages;
  const avgTac = pages.reduce((s, p) => s + (p.tac ?? 0), 0) / totalPages;
  const maxTac = Math.max(...pages.map((p) => p.tac ?? 0));

  const prompt = `You are a professional print production consultant. Analyze the following ink coverage data and provide a concise, actionable summary.

Document: ${files.length} file(s), ${totalPages} total page(s)
Average CMYK Coverage:
- Cyan: ${avgC.toFixed(2)}%
- Magenta: ${avgM.toFixed(2)}%
- Yellow: ${avgY.toFixed(2)}%
- Black (Key): ${avgK.toFixed(2)}%
- Total Area Coverage (TAC): ${avgTac.toFixed(2)}%
- Highest TAC on any page: ${maxTac.toFixed(2)}%

Provide:
1. A 2-3 sentence plain-language summary of the ink coverage profile.
2. 3-5 specific, actionable cost-saving recommendations (e.g., reduce ink density, use draft mode, switch to black-only for certain pages, consider paper type, etc.).

Respond in JSON format: { "summary": "...", "recommendations": ["...", "...", "..."] }`;

  const messages: Message[] = [
    { role: "system", content: "You are a print production expert. Always respond with valid JSON." },
    { role: "user", content: prompt },
  ];
  const response = await invokeLLM({
    messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ink_summary",
        strict: true,
        schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            recommendations: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "recommendations"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices?.[0]?.message?.content;
  if (!rawContent) return;
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  const parsed = JSON.parse(content);
  await saveAiSummary({
    sessionId,
    summary: parsed.summary,
    recommendations: parsed.recommendations,
  });
}

// ─── Cost Calculation ─────────────────────────────────────────────────────────

export interface CostParams {
  // ── Single-cartridge pricing (monochrome or combined colour) ──────────────
  pricePerCartridge?: number;
  yieldPages?: number;
  coveragePercent?: number; // yield reference coverage %
  pricePerMl?: number;
  mlPerCartridge?: number;

  // ── Per-channel cartridge pricing (overrides single price per channel) ───
  // Each channel can have its own cartridge price + yield so colour printers
  // with separate C/M/Y/K cartridges are costed accurately.
  cCartridgePrice?: number;  // Cyan cartridge price
  cCartridgeYield?: number;  // Cyan cartridge yield (pages at reference coverage)
  mCartridgePrice?: number;  // Magenta cartridge price
  mCartridgeYield?: number;
  yCartridgePrice?: number;  // Yellow cartridge price
  yCartridgeYield?: number;
  kCartridgePrice?: number;  // Black cartridge price
  kCartridgeYield?: number;

  paperCostPerSheet: number;
  isDuplex: boolean;
  copies: number;
}

export interface PageCostResult {
  pageNumber: number;
  fileId: number;
  cCoverage: number;
  mCoverage: number;
  yCoverage: number;
  kCoverage: number;
  tac: number;
  cCost: number;
  mCost: number;
  yCost: number;
  kCost: number;
  inkCostPerPage: number;
  paperCostPerPage: number;
  totalCostPerPage: number;
}

export function computeCosts(
  pages: Array<{
    id: number;
    fileId: number;
    pageNumber: number;
    cCoverage: number | null;
    mCoverage: number | null;
    yCoverage: number | null;
    kCoverage: number | null;
    tac: number | null;
  }>,
  params: CostParams
): {
  perPage: PageCostResult[];
  totalInkCost: number;
  totalPaperCost: number;
  totalCost: number;
  costPerCopy: number;
  perChannel: { channel: string; avgCoverage: number; cost: number }[];
} {
  const {
    pricePerCartridge, yieldPages, coveragePercent = 5,
    pricePerMl, mlPerCartridge,
    cCartridgePrice, cCartridgeYield,
    mCartridgePrice, mCartridgeYield,
    yCartridgePrice, yCartridgeYield,
    kCartridgePrice, kCartridgeYield,
    paperCostPerSheet, isDuplex, copies,
  } = params;

  // Helper: cost per 1% coverage for a single channel
  // Uses per-channel price if provided, falls back to shared price, then per-mL.
  const channelCostPer1Pct = (
    chPrice: number | undefined,
    chYield: number | undefined
  ): number => {
    if (chPrice && chYield && chYield > 0) {
      return chPrice / (chYield * coveragePercent);
    }
    if (pricePerCartridge && yieldPages && yieldPages > 0) {
      return pricePerCartridge / (yieldPages * coveragePercent);
    }
    if (pricePerMl) {
      return pricePerMl * 0.01;
    }
    return 0;
  };

  const cRate = channelCostPer1Pct(cCartridgePrice, cCartridgeYield);
  const mRate = channelCostPer1Pct(mCartridgePrice, mCartridgeYield);
  const yRate = channelCostPer1Pct(yCartridgePrice, yCartridgeYield);
  const kRate = channelCostPer1Pct(kCartridgePrice, kCartridgeYield);

  const duplexFactor = isDuplex ? 0.5 : 1;

  const perPage: PageCostResult[] = pages.map((p) => {
    const c = p.cCoverage ?? 0;
    const m = p.mCoverage ?? 0;
    const y = p.yCoverage ?? 0;
    const k = p.kCoverage ?? 0;
    const tac = p.tac ?? (c + m + y + k);

    const cCost = c * cRate;
    const mCost = m * mRate;
    const yCost = y * yRate;
    const kCost = k * kRate;
    const inkCostPerPage = cCost + mCost + yCost + kCost;
    const paperCostPerPage = paperCostPerSheet * duplexFactor;
    const totalCostPerPage = inkCostPerPage + paperCostPerPage;

    return {
      pageNumber: p.pageNumber,
      fileId: p.fileId,
      cCoverage: c,
      mCoverage: m,
      yCoverage: y,
      kCoverage: k,
      tac,
      cCost,
      mCost,
      yCost,
      kCost,
      inkCostPerPage,
      paperCostPerPage,
      totalCostPerPage,
    };
  });

  const totalInkCost = perPage.reduce((s, p) => s + p.inkCostPerPage, 0) * copies;
  const totalPaperCost = perPage.reduce((s, p) => s + p.paperCostPerPage, 0) * copies;
  const totalCost = totalInkCost + totalPaperCost;
  const costPerCopy = perPage.reduce((s, p) => s + p.totalCostPerPage, 0);

  const n = pages.length || 1;
  const perChannel = [
    { channel: "Cyan",    avgCoverage: perPage.reduce((s, p) => s + p.cCoverage, 0) / n, cost: perPage.reduce((s, p) => s + (p.cCost ?? 0), 0) * copies },
    { channel: "Magenta", avgCoverage: perPage.reduce((s, p) => s + p.mCoverage, 0) / n, cost: perPage.reduce((s, p) => s + (p.mCost ?? 0), 0) * copies },
    { channel: "Yellow",  avgCoverage: perPage.reduce((s, p) => s + p.yCoverage, 0) / n, cost: perPage.reduce((s, p) => s + (p.yCost ?? 0), 0) * copies },
    { channel: "Black",   avgCoverage: perPage.reduce((s, p) => s + p.kCoverage, 0) / n, cost: perPage.reduce((s, p) => s + (p.kCost ?? 0), 0) * copies },
  ];

  return { perPage, totalInkCost, totalPaperCost, totalCost, costPerCopy, perChannel };
}
