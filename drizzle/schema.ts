import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Analysis sessions — one per upload batch
export const analysisSessions = mysqlTable("analysis_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  shareToken: varchar("shareToken", { length: 64 }).unique(),
  mode: mysqlEnum("mode", ["standard", "private"]).default("standard").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "complete", "error"])
    .default("pending")
    .notNull(),
  errorMessage: text("errorMessage"),
  costParams: json("costParams").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysisSession = typeof analysisSessions.$inferSelect;

// Uploaded files within a session
export const uploadedFiles = mysqlTable("uploaded_files", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  filename: varchar("filename", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  fileSize: int("fileSize"),
  pageCount: int("pageCount").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UploadedFile = typeof uploadedFiles.$inferSelect;

// Per-page analysis results
export const pageAnalyses = mysqlTable("page_analyses", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  sessionId: int("sessionId").notNull(),
  pageNumber: int("pageNumber").notNull(),
  // Coverage percentages 0-100
  cCoverage: float("cCoverage").default(0),
  mCoverage: float("mCoverage").default(0),
  yCoverage: float("yCoverage").default(0),
  kCoverage: float("kCoverage").default(0),
  tac: float("tac").default(0), // Total Area Coverage
  // RGB channel coverage (for RGB inkjet printers — only populated for RGB-mode files)
  rCoverage: float("rCoverage").default(0),
  gCoverage: float("gCoverage").default(0),
  bCoverage: float("bCoverage").default(0),
  totalPixels: int("totalPixels").default(0),
  inkPixels: int("inkPixels").default(0),
  thumbnailKey: varchar("thumbnailKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PageAnalysis = typeof pageAnalyses.$inferSelect;

// Cost presets saved by users
export const costPresets = mysqlTable("cost_presets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  name: varchar("name", { length: 128 }).notNull(),
  // Shared / fallback pricing
  pricePerCartridge: float("pricePerCartridge"),
  yieldPages: int("yieldPages"),
  coveragePercent: float("coveragePercent").default(5),
  pricePerMl: float("pricePerMl"),
  mlPerCartridge: float("mlPerCartridge"),
  // Per-channel CMYK cartridge pricing
  cCartridgePrice: float("cCartridgePrice"),
  cCartridgeYield: int("cCartridgeYield"),
  mCartridgePrice: float("mCartridgePrice"),
  mCartridgeYield: int("mCartridgeYield"),
  yCartridgePrice: float("yCartridgePrice"),
  yCartridgeYield: int("yCartridgeYield"),
  kCartridgePrice: float("kCartridgePrice"),
  kCartridgeYield: int("kCartridgeYield"),
  // Brand metadata
  brand: varchar("brand", { length: 32 }),          // e.g. HP, Canon, Epson
  cartridgeModel: varchar("cartridgeModel", { length: 64 }), // e.g. HP 952XL
  cartridgeType: varchar("cartridgeType", { length: 16 }), // Inkjet or Laser
  compatiblePrinters: text("compatiblePrinters"),
  paperCostPerSheet: float("paperCostPerSheet").default(0.01),
  isDuplex: boolean("isDuplex").default(false),
  isBuiltIn: boolean("isBuiltIn").default(false),
  // Flexible cartridge system — stores the full cartridge config as JSON.
  // When present, this takes priority over the individual CMYK scalar columns above.
  printerType: varchar("printerType", { length: 32 }),  // e.g. "2-cartridge", "4-cartridge"
  cartridgesJson: json("cartridgesJson").$type<import('../shared/cartridgeTypes').CartridgeDef[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CostPreset = typeof costPresets.$inferSelect;

// Paper size presets
export const paperPresets = mysqlTable("paper_presets", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  widthMm: float("widthMm").notNull(),
  heightMm: float("heightMm").notNull(),
  isBuiltIn: boolean("isBuiltIn").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PaperPreset = typeof paperPresets.$inferSelect;

// AI-generated summaries for sessions
export const aiSummaries = mysqlTable("ai_summaries", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().unique(),
  summary: text("summary"),
  recommendations: json("recommendations").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AiSummary = typeof aiSummaries.$inferSelect;

// Printer models linked to toner presets
export const printers = mysqlTable("printers", {
  id: int("id").autoincrement().primaryKey(),
  brand: varchar("brand", { length: 32 }).notNull(),       // e.g. HP, Canon
  series: varchar("series", { length: 64 }),               // e.g. OfficeJet Pro, PIXMA
  model: varchar("model", { length: 128 }).notNull(),      // e.g. HP OfficeJet Pro 8710
  presetId: int("presetId").notNull(),                     // FK → cost_presets.id
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Printer = typeof printers.$inferSelect;
