import { eq, and, or, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  analysisSessions,
  uploadedFiles,
  pageAnalyses,
  costPresets,
  paperPresets,
  aiSummaries,
  printers,
  type AnalysisSession,
  type UploadedFile,
  type PageAnalysis,
  type CostPreset,
  type PaperPreset,
  type Printer,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Analysis Sessions ────────────────────────────────────────────────────────

export async function createSession(data: {
  userId?: number;
  mode: "standard" | "private";
  shareToken: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(analysisSessions).values({
    userId: data.userId ?? null,
    mode: data.mode,
    shareToken: data.shareToken,
    status: "pending",
    expiresAt: data.expiresAt,
  });
  return result[0].insertId as number;
}

export async function updateSessionStatus(
  sessionId: number,
  status: AnalysisSession["status"],
  errorMessage?: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(analysisSessions)
    .set({ status, errorMessage: errorMessage ?? null })
    .where(eq(analysisSessions.id, sessionId));
}

export async function saveCostParams(
  sessionId: number,
  costParams: Record<string, unknown>
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(analysisSessions)
    .set({ costParams })
    .where(eq(analysisSessions.id, sessionId));
}

export async function getSession(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(analysisSessions)
    .where(eq(analysisSessions.id, sessionId))
    .limit(1);
  return result[0];
}

export async function getSessionByShareToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(analysisSessions)
    .where(eq(analysisSessions.shareToken, token))
    .limit(1);
  return result[0];
}

// ─── Uploaded Files ───────────────────────────────────────────────────────────

export async function createUploadedFile(data: {
  sessionId: number;
  filename: string;
  mimeType: string;
  storageKey?: string;
  fileSize?: number;
  pageCount?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(uploadedFiles).values(data);
  return result[0].insertId as number;
}

export async function updateFilePageCount(fileId: number, pageCount: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(uploadedFiles).set({ pageCount }).where(eq(uploadedFiles.id, fileId));
}

export async function getFilesBySession(sessionId: number): Promise<UploadedFile[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadedFiles).where(eq(uploadedFiles.sessionId, sessionId));
}

// ─── Page Analyses ────────────────────────────────────────────────────────────

export async function savePageAnalysis(data: {
  fileId: number;
  sessionId: number;
  pageNumber: number;
  cCoverage: number;
  mCoverage: number;
  yCoverage: number;
  kCoverage: number;
  tac: number;
  rCoverage?: number;
  gCoverage?: number;
  bCoverage?: number;
  totalPixels: number;
  inkPixels: number;
  thumbnailKey?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(pageAnalyses).values(data);
  return result[0].insertId as number;
}

export async function getPageAnalysesBySession(sessionId: number): Promise<PageAnalysis[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pageAnalyses).where(eq(pageAnalyses.sessionId, sessionId));
}

// ─── Cost Presets ─────────────────────────────────────────────────────────────

export async function getCostPresets(userId?: number): Promise<CostPreset[]> {
  const db = await getDb();
  if (!db) return [];
  if (userId) {
    return db
      .select()
      .from(costPresets)
      .where(or(eq(costPresets.isBuiltIn, true), eq(costPresets.userId, userId)));
  }
  return db.select().from(costPresets).where(eq(costPresets.isBuiltIn, true));
}

export async function saveCostPreset(data: {
  userId?: number;
  name: string;
  pricePerCartridge?: number;
  yieldPages?: number;
  coveragePercent?: number;
  pricePerMl?: number;
  mlPerCartridge?: number;
  paperCostPerSheet?: number;
  isDuplex?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(costPresets).values({ ...data, isBuiltIn: false });
  return result[0].insertId as number;
}

export async function deleteCostPreset(presetId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(costPresets)
    .where(and(eq(costPresets.id, presetId), eq(costPresets.userId, userId)));
}

// ─── Paper Presets ────────────────────────────────────────────────────────────

export async function getPaperPresets(): Promise<PaperPreset[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(paperPresets);
}

// ─── AI Summaries ─────────────────────────────────────────────────────────────

export async function saveAiSummary(data: {
  sessionId: number;
  summary: string;
  recommendations: string[];
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(aiSummaries)
    .values(data)
    .onDuplicateKeyUpdate({ set: { summary: data.summary, recommendations: data.recommendations } });
}

export async function getAiSummary(sessionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(aiSummaries)
    .where(eq(aiSummaries.sessionId, sessionId))
    .limit(1);
  return result[0];
}

// ─── Printers ─────────────────────────────────────────────────────────────────

export async function getPrinterBrands(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ brand: printers.brand })
    .from(printers)
    .orderBy(printers.brand);
  return rows.map((r) => r.brand);
}

export async function getPrintersByBrand(brand: string): Promise<Printer[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(printers)
    .where(eq(printers.brand, brand))
    .orderBy(printers.series, printers.model);
}

export async function getPresetByPrinterId(printerId: number): Promise<CostPreset | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const printer = await db
    .select()
    .from(printers)
    .where(eq(printers.id, printerId))
    .limit(1);
  if (!printer[0]?.presetId) return undefined;
  const preset = await db
    .select()
    .from(costPresets)
    .where(eq(costPresets.id, printer[0].presetId))
    .limit(1);
  return preset[0];
}

// Search printers across all brands by model name, series, or brand
export async function searchPrinters(query: string): Promise<Printer[]> {
  const db = await getDb();
  if (!db) return [];
  const q = `%${query}%`;
  return db
    .select()
    .from(printers)
    .where(
      or(
        like(printers.model, q),
        like(printers.series, q),
        like(printers.brand, q)
      )
    )
    .orderBy(printers.brand, printers.model)
    .limit(20);
}

// Add a custom printer with its cartridge yields (user-submitted)
export async function addCustomPrinter(data: {
  brand: string;
  series?: string;
  model: string;
  cartridgeModel?: string;
  cartridgeType?: string;
  cCartridgePrice?: number;
  cCartridgeYield?: number;
  mCartridgePrice?: number;
  mCartridgeYield?: number;
  yCartridgePrice?: number;
  yCartridgeYield?: number;
  kCartridgePrice?: number;
  kCartridgeYield?: number;
  pricePerCartridge?: number;
  yieldPages?: number;
  coveragePercent?: number;
  pricePerMl?: number;
  mlPerCartridge?: number;
}): Promise<{ printerId: number; presetId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Create a cost preset for the custom printer
  const presetResult = await db.insert(costPresets).values({
    name: `${data.brand} ${data.cartridgeModel ?? data.model}`,
    pricePerCartridge: data.pricePerCartridge ?? null,
    yieldPages: data.yieldPages ?? null,
    coveragePercent: data.coveragePercent ?? 5,
    cCartridgePrice: data.cCartridgePrice ?? null,
    cCartridgeYield: data.cCartridgeYield ?? null,
    mCartridgePrice: data.mCartridgePrice ?? null,
    mCartridgeYield: data.mCartridgeYield ?? null,
    yCartridgePrice: data.yCartridgePrice ?? null,
    yCartridgeYield: data.yCartridgeYield ?? null,
    kCartridgePrice: data.kCartridgePrice ?? null,
    kCartridgeYield: data.kCartridgeYield ?? null,
    pricePerMl: data.pricePerMl ?? null,
    mlPerCartridge: data.mlPerCartridge ?? null,
    brand: data.brand,
    cartridgeModel: data.cartridgeModel ?? null,
    cartridgeType: data.cartridgeType ?? null,
    compatiblePrinters: data.model,
    paperCostPerSheet: 0.01,
    isBuiltIn: false,
  });
  const presetId = (presetResult as any)[0].insertId as number;

  // Create the printer record
  const printerResult = await db.insert(printers).values({
    brand: data.brand,
    series: data.series ?? null,
    model: data.model,
    presetId,
  });
  const printerId = (printerResult as any)[0].insertId as number;

  return { printerId, presetId };
}
