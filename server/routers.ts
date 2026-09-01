import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  createSession,
  getSession,
  getSessionByShareToken,
  getFilesBySession,
  getPageAnalysesBySession,
  getCostPresets,
  saveCostPreset,
  deleteCostPreset,
  getPaperPresets,
  getAiSummary,
  saveCostParams,
  getPrinterBrands,
  getPrintersByBrand,
  getPresetByPrinterId,
  searchPrinters,
  addCustomPrinter,
} from "./db";
import { computeCosts, generateAiSummaryForSession } from "./analysisService";
import { generateCsv, generatePdfReport } from "./exportService";
import { storagePut } from "./storage";

// ─── Cost params schema ───────────────────────────────────────────────────────
const cartridgeDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  channels: z.array(z.enum(["C", "M", "Y", "K", "R", "G", "B"])),
  blended: z.boolean(),
  price: z.number(),
  yield: z.number(),
  color: z.string().optional(),
});

const costParamsSchema = z.object({
  pricePerCartridge: z.number().optional(),
  yieldPages: z.number().optional(),
  coveragePercent: z.number().default(5),
  pricePerMl: z.number().optional(),
  mlPerCartridge: z.number().optional(),
  // Per-channel cartridge pricing (legacy)
  cCartridgePrice: z.number().optional(),
  cCartridgeYield: z.number().optional(),
  mCartridgePrice: z.number().optional(),
  mCartridgeYield: z.number().optional(),
  yCartridgePrice: z.number().optional(),
  yCartridgeYield: z.number().optional(),
  kCartridgePrice: z.number().optional(),
  kCartridgeYield: z.number().optional(),
  paperCostPerSheet: z.number().default(0.01),
  isDuplex: z.boolean().default(false),
  copies: z.number().int().min(1).default(1),
  // RGB mode (legacy)
  colorMode: z.enum(["cmyk", "rgb"]).default("cmyk"),
  rCartridgePrice: z.number().optional(),
  rCartridgeYield: z.number().optional(),
  gCartridgePrice: z.number().optional(),
  gCartridgeYield: z.number().optional(),
  bCartridgePrice: z.number().optional(),
  bCartridgeYield: z.number().optional(),
  // Flexible cartridge system (new — takes priority)
  printerType: z.string().optional(),
  cartridges: z.array(cartridgeDefSchema).optional(),
  // Print to Empty: current usable ink in each cartridge, 0–100%.
  remainingInkPercent: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Analysis ──────────────────────────────────────────────────────────────
  analysis: router({
    // Create a session and get an upload URL
    createSession: publicProcedure
      .input(z.object({ mode: z.enum(["standard", "private"]).default("standard") }))
      .mutation(async ({ input, ctx }) => {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL
        const shareToken = uuidv4().replace(/-/g, "");
        const sessionId = await createSession({
          userId: ctx.user?.id,
          mode: input.mode,
          shareToken,
          expiresAt,
        });
        return { sessionId, shareToken };
      }),

    // Poll session status
    getSession: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        const session = await getSession(input.sessionId);
        if (!session) throw new Error("Session not found");
        return session;
      }),

    // Get full results for a session
    getResults: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        const session = await getSession(input.sessionId);
        if (!session) throw new Error("Session not found");
        const files = await getFilesBySession(input.sessionId);
        const pages = await getPageAnalysesBySession(input.sessionId);
        const aiSummary = await getAiSummary(input.sessionId);
        return { session, files, pages, aiSummary };
      }),

    // Get results by share token (public)
    getByShareToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const session = await getSessionByShareToken(input.token);
        if (!session) throw new Error("Shared result not found or expired");
        if (new Date(session.expiresAt) < new Date()) throw new Error("This shared link has expired");
        const files = await getFilesBySession(session.id);
        const pages = await getPageAnalysesBySession(session.id);
        const aiSummary = await getAiSummary(session.id);
        return { session, files, pages, aiSummary };
      }),

    // Compute costs for a session
    computeCosts: publicProcedure
      .input(z.object({ sessionId: z.number(), params: costParamsSchema }))
      .mutation(async ({ input }) => {
        const pages = await getPageAnalysesBySession(input.sessionId);
        if (pages.length === 0) throw new Error("No analysis results found");
        // Persist cost params so shared PDF exports can include the cost breakdown
        await saveCostParams(input.sessionId, input.params as Record<string, unknown>);
        const result = computeCosts(pages, input.params);
        return result;
      }),

    // Regenerate AI summary
    regenerateAiSummary: publicProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ input }) => {
        await generateAiSummaryForSession(input.sessionId);
        return { success: true };
      }),

    // Export CSV
    exportCsv: publicProcedure
      .input(
        z.object({
          sessionId: z.number(),
          params: costParamsSchema.optional(),
        })
      )
      .mutation(async ({ input }) => {
        const session = await getSession(input.sessionId);
        const pages = await getPageAnalysesBySession(input.sessionId);
        const files = await getFilesBySession(input.sessionId);
        let costResults;
        if (input.params) {
          const result = computeCosts(pages, input.params);
          costResults = result.perPage;
        }
        const csv = generateCsv(pages, files, costResults);
        // Only store in S3 for standard (non-private) sessions
        if (session?.mode === "standard") {
          const key = `exports/${input.sessionId}/report-${Date.now()}.csv`;
          await storagePut(key, Buffer.from(csv, "utf-8"), "text/csv");
        }
        return { csv };
      }),

    // Export PDF (by sessionId, optionally with cost params override)
    exportPdf: publicProcedure
      .input(
        z.object({
          sessionId: z.number(),
          params: costParamsSchema.optional(),
        })
      )
      .mutation(async ({ input }) => {
        const session = await getSession(input.sessionId);
        const pages = await getPageAnalysesBySession(input.sessionId);
        const files = await getFilesBySession(input.sessionId);
        const aiSummary = await getAiSummary(input.sessionId);

        // Use provided params, or fall back to persisted cost params from computeCosts
        const effectiveParams = input.params ?? (session?.costParams as any ?? undefined);

        let costResults;
        let totalCost, totalInkCost, totalPaperCost;
        if (effectiveParams) {
          const result = computeCosts(pages, effectiveParams);
          costResults = result.perPage;
          totalCost = result.totalCost;
          totalInkCost = result.totalInkCost;
          totalPaperCost = result.totalPaperCost;
        }

        const pdfBuffer = await generatePdfReport({
          pages,
          files,
          costResults,
          totalCost,
          totalInkCost,
          totalPaperCost,
          copies: effectiveParams?.copies,
          aiSummary: aiSummary?.summary ?? undefined,
          aiRecommendations: (aiSummary?.recommendations as string[]) ?? undefined,
        });

        // For private sessions, return base64 data URL instead of S3 link
        if (session?.mode === "private") {
          const base64 = pdfBuffer.toString("base64");
          return { url: `data:application/pdf;base64,${base64}`, isDataUrl: true };
        }

        const key = `exports/${input.sessionId}/report-${Date.now()}.pdf`;
        const { url } = await storagePut(key, pdfBuffer, "application/pdf");
        return { url, isDataUrl: false };
      }),

    // Export PDF by share token (for shared result viewers)
    exportPdfByShareToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const session = await getSessionByShareToken(input.token);
        if (!session) throw new Error("Shared result not found or expired");
        if (new Date(session.expiresAt) < new Date()) throw new Error("This shared link has expired");
        if (session.mode === "private") throw new Error("PDF export is not available for private sessions");

        const pages = await getPageAnalysesBySession(session.id);
        const files = await getFilesBySession(session.id);
        const aiSummary = await getAiSummary(session.id);

        const persistedParams = session.costParams as any ?? undefined;
        let costResults;
        let totalCost, totalInkCost, totalPaperCost;
        if (persistedParams) {
          const result = computeCosts(pages, persistedParams);
          costResults = result.perPage;
          totalCost = result.totalCost;
          totalInkCost = result.totalInkCost;
          totalPaperCost = result.totalPaperCost;
        }

        const pdfBuffer = await generatePdfReport({
          pages,
          files,
          costResults,
          totalCost,
          totalInkCost,
          totalPaperCost,
          copies: persistedParams?.copies,
          aiSummary: aiSummary?.summary ?? undefined,
          aiRecommendations: (aiSummary?.recommendations as string[]) ?? undefined,
        });

        const key = `exports/shared/${session.id}/report-${Date.now()}.pdf`;
        const { url } = await storagePut(key, pdfBuffer, "application/pdf");
        return { url, isDataUrl: false };
      }),
  }),

  // ─── Printers ──────────────────────────────────────────────────────────────
  printers: router({
    // List all brands that have printer entries
    listBrands: publicProcedure.query(async () => {
      return getPrinterBrands();
    }),

    // List all printers for a given brand
    listByBrand: publicProcedure
      .input(z.object({ brand: z.string() }))
      .query(async ({ input }) => {
        return getPrintersByBrand(input.brand);
      }),

    // Get the toner preset for a specific printer
    getPreset: publicProcedure
      .input(z.object({ printerId: z.number() }))
      .mutation(async ({ input }) => {
        return getPresetByPrinterId(input.printerId);
      }),

    // Search printers across all brands
    search: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        return searchPrinters(input.query);
      }),

    // Add a custom printer with cartridge yields
    addCustom: publicProcedure
      .input(
        z.object({
          brand: z.string().min(1).max(64),
          series: z.string().max(64).optional(),
          model: z.string().min(1).max(128),
          cartridgeModel: z.string().max(64).optional(),
          cartridgeType: z.enum(["Inkjet", "Laser"]).optional(),
          cCartridgePrice: z.number().positive().optional(),
          cCartridgeYield: z.number().int().positive().optional(),
          mCartridgePrice: z.number().positive().optional(),
          mCartridgeYield: z.number().int().positive().optional(),
          yCartridgePrice: z.number().positive().optional(),
          yCartridgeYield: z.number().int().positive().optional(),
          kCartridgePrice: z.number().positive().optional(),
          kCartridgeYield: z.number().int().positive().optional(),
          pricePerCartridge: z.number().positive().optional(),
          yieldPages: z.number().int().positive().optional(),
          coveragePercent: z.number().default(5),
          pricePerMl: z.number().positive().optional(),
          mlPerCartridge: z.number().positive().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return addCustomPrinter(input);
      }),
  }),

  // ─── Presets ───────────────────────────────────────────────────────────────
  presets: router({
    listCost: publicProcedure.query(async ({ ctx }) => {
      return getCostPresets(ctx.user?.id);
    }),

    saveCost: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(128),
          pricePerCartridge: z.number().optional(),
          yieldPages: z.number().optional(),
          coveragePercent: z.number().default(5),
          pricePerMl: z.number().optional(),
          mlPerCartridge: z.number().optional(),
          paperCostPerSheet: z.number().default(0.01),
          isDuplex: z.boolean().default(false),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const id = await saveCostPreset({ ...input, userId: ctx.user?.id });
        return { id };
      }),

    deleteCost: protectedProcedure
      .input(z.object({ presetId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteCostPreset(input.presetId, ctx.user.id);
        return { success: true };
      }),

    listPaper: publicProcedure.query(async () => {
      return getPaperPresets();
    }),
  }),
});

export type AppRouter = typeof appRouter;
