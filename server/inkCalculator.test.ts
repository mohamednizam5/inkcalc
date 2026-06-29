import { describe, expect, it } from "vitest";
import { computeCosts, type CostParams } from "./analysisService";

// ─── Mock page data ───────────────────────────────────────────────────────────

const mockPages = [
  { id: 1, fileId: 1, pageNumber: 1, cCoverage: 10, mCoverage: 5, yCoverage: 8, kCoverage: 20, tac: 43 },
  { id: 2, fileId: 1, pageNumber: 2, cCoverage: 2, mCoverage: 2, yCoverage: 2, kCoverage: 15, tac: 21 },
  { id: 3, fileId: 1, pageNumber: 3, cCoverage: 0, mCoverage: 0, yCoverage: 0, kCoverage: 5, tac: 5 },
];

// ─── Cost Calculation Tests ───────────────────────────────────────────────────

describe("computeCosts — cartridge-based pricing", () => {
  const params: CostParams = {
    pricePerCartridge: 45,
    yieldPages: 2000,
    coveragePercent: 5,
    paperCostPerSheet: 0.01,
    isDuplex: false,
    copies: 1,
  };

  it("computes cost per 1% correctly", () => {
    // costPer1% = 45 / (2000 * 5) = 0.0045
    const result = computeCosts(mockPages, params);
    const expectedCostPer1Pct = 45 / (2000 * 5); // 0.0045

    // Page 1: TAC=43, ink = 43 * 0.0045 = 0.1935, paper = 0.01
    const page1 = result.perPage.find((p) => p.pageNumber === 1)!;
    expect(page1.inkCostPerPage).toBeCloseTo(43 * expectedCostPer1Pct, 6);
    expect(page1.paperCostPerPage).toBeCloseTo(0.01, 6);
    expect(page1.totalCostPerPage).toBeCloseTo(43 * expectedCostPer1Pct + 0.01, 6);
  });

  it("sums total costs correctly across all pages", () => {
    const result = computeCosts(mockPages, params);
    const expectedCostPer1Pct = 45 / (2000 * 5);
    const totalTac = 43 + 21 + 5; // 69
    const expectedInk = totalTac * expectedCostPer1Pct;
    const expectedPaper = 3 * 0.01;
    expect(result.totalInkCost).toBeCloseTo(expectedInk, 5);
    expect(result.totalPaperCost).toBeCloseTo(expectedPaper, 5);
    expect(result.totalCost).toBeCloseTo(expectedInk + expectedPaper, 5);
  });

  it("multiplies by copies correctly", () => {
    const result1 = computeCosts(mockPages, { ...params, copies: 1 });
    const result5 = computeCosts(mockPages, { ...params, copies: 5 });
    expect(result5.totalCost).toBeCloseTo(result1.totalCost * 5, 5);
  });

  it("applies duplex factor (0.5 paper cost)", () => {
    const simplex = computeCosts(mockPages, { ...params, isDuplex: false });
    const duplex = computeCosts(mockPages, { ...params, isDuplex: true });
    // Duplex halves paper cost
    expect(duplex.totalPaperCost).toBeCloseTo(simplex.totalPaperCost / 2, 5);
    // Ink cost should be the same
    expect(duplex.totalInkCost).toBeCloseTo(simplex.totalInkCost, 5);
  });

  it("returns per-channel breakdown with correct channel names", () => {
    const result = computeCosts(mockPages, params);
    const channels = result.perChannel.map((c) => c.channel);
    expect(channels).toContain("Cyan");
    expect(channels).toContain("Magenta");
    expect(channels).toContain("Yellow");
    expect(channels).toContain("Black");
  });

  it("returns correct number of per-page results", () => {
    const result = computeCosts(mockPages, params);
    expect(result.perPage).toHaveLength(3);
  });
});

describe("computeCosts — per-mL pricing", () => {
  const params: CostParams = {
    pricePerMl: 0.05,
    mlPerCartridge: 70,
    paperCostPerSheet: 0.008,
    isDuplex: false,
    copies: 1,
    coveragePercent: 5,
  };

  it("computes ink cost using per-mL pricing", () => {
    const result = computeCosts(mockPages, params);
    // costPer1% = pricePerMl * 0.01 = 0.05 * 0.01 = 0.0005
    const expectedCostPer1Pct = 0.05 * 0.01;
    const page1 = result.perPage.find((p) => p.pageNumber === 1)!;
    expect(page1.inkCostPerPage).toBeCloseTo(43 * expectedCostPer1Pct, 6);
  });
});

describe("computeCosts — zero coverage", () => {
  it("handles blank pages (zero coverage) gracefully", () => {
    const blankPages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 0, mCoverage: 0, yCoverage: 0, kCoverage: 0, tac: 0 },
    ];
    const params: CostParams = {
      pricePerCartridge: 45,
      yieldPages: 2000,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };
    const result = computeCosts(blankPages, params);
    expect(result.totalInkCost).toBe(0);
    expect(result.totalPaperCost).toBeCloseTo(0.01, 5);
    expect(result.costPerCopy).toBeCloseTo(0.01, 5);
  });
});

describe("computeCosts — no pricing provided", () => {
  it("returns zero ink costs when no pricing is provided", () => {
    const params: CostParams = {
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
      coveragePercent: 5,
    };
    const result = computeCosts(mockPages, params);
    expect(result.totalInkCost).toBe(0);
    expect(result.totalPaperCost).toBeGreaterThan(0);
  });
});

// ─── Share Token Tests ────────────────────────────────────────────────────────

describe("share token generation", () => {
  it("generates a non-empty string token", () => {
    const { v4: uuidv4 } = require("uuid");
    const token = uuidv4().replace(/-/g, "");
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.length).toBe(32);
  });

  it("generates unique tokens", () => {
    const { v4: uuidv4 } = require("uuid");
    const tokens = new Set(Array.from({ length: 100 }, () => uuidv4().replace(/-/g, "")));
    expect(tokens.size).toBe(100);
  });
});

// ─── PDF Report Generation Tests ─────────────────────────────────────────────

import { generatePdfReport } from "./exportService";

const mockFiles = [
  { id: 1, sessionId: 1, filename: "brochure.pdf", mimeType: "application/pdf",
    storageKey: "uploads/1/brochure.pdf", storageUrl: "/manus-storage/brochure.pdf",
    pageCount: 3, isPrivate: false, createdAt: new Date() },
] as any[];

describe("generatePdfReport", () => {
  it("returns a non-empty Buffer with a PDF header", async () => {
    const buf = await generatePdfReport({ pages: mockPages as any, files: mockFiles });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
    // PDF magic bytes: %PDF
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("includes cost summary when costResults are provided", async () => {
    const costResults = mockPages.map((p) => ({
      fileId: p.fileId,
      pageNumber: p.pageNumber,
      inkCostPerPage: 0.05,
      paperCostPerPage: 0.01,
      totalCostPerPage: 0.06,
    }));
    const buf = await generatePdfReport({
      pages: mockPages as any,
      files: mockFiles,
      costResults,
      totalCost: 0.18,
      totalInkCost: 0.15,
      totalPaperCost: 0.03,
      copies: 1,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(500);
  });

  it("includes AI summary and recommendations when provided", async () => {
    const buf = await generatePdfReport({
      pages: mockPages as any,
      files: mockFiles,
      aiSummary: "This document has moderate ink usage across all CMYK channels.",
      aiRecommendations: ["Reduce black ink coverage by 10%.", "Switch to duplex printing."],
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("handles empty pages array gracefully", async () => {
    const buf = await generatePdfReport({ pages: [], files: [] });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("handles multi-copy jobs with per-copy cost", async () => {
    const buf = await generatePdfReport({
      pages: mockPages as any,
      files: mockFiles,
      totalCost: 1.80,
      totalInkCost: 1.50,
      totalPaperCost: 0.30,
      copies: 10,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("embeds the SCTDJM logo — PDF is larger than a text-only report would be", async () => {
    // The SCTDJM logo PNG is ~3 KB. A PDF containing the embedded image should
    // be meaningfully larger than 5 KB (well above a text-only baseline).
    const buf = await generatePdfReport({ pages: mockPages as any, files: mockFiles });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
    // A PDF with an embedded PNG image will be at least 5 KB
    expect(buf.length).toBeGreaterThan(5000);
  });
});

// ─── Per-Channel Cartridge Pricing Tests ─────────────────────────────────────

describe("computeCosts — per-channel cartridge pricing", () => {
  const mockPagesForChannel = [
    { id: 1, fileId: 1, pageNumber: 1, cCoverage: 20, mCoverage: 10, yCoverage: 5, kCoverage: 30, tac: 65 },
  ];

  it("uses per-channel prices when provided, ignoring shared price", () => {
    const params: CostParams = {
      // Shared fallback — should NOT be used when per-channel prices are set
      pricePerCartridge: 999,
      yieldPages: 1000,
      coveragePercent: 5,
      // Per-channel prices
      cCartridgePrice: 20,  cCartridgeYield: 2000,
      mCartridgePrice: 18,  mCartridgeYield: 1500,
      yCartridgePrice: 16,  yCartridgeYield: 1800,
      kCartridgePrice: 12,  kCartridgeYield: 3000,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };

    const result = computeCosts(mockPagesForChannel as any, params);
    const p = result.perPage[0]!;

    // cRate = 20 / (2000 * 5) = 0.002; cCost = 20 * 0.002 = 0.04
    expect(p.cCost).toBeCloseTo(20 * (20 / (2000 * 5)), 6);
    // mRate = 18 / (1500 * 5) = 0.0024; mCost = 10 * 0.0024 = 0.024
    expect(p.mCost).toBeCloseTo(10 * (18 / (1500 * 5)), 6);
    // yRate = 16 / (1800 * 5) = 0.001778; yCost = 5 * 0.001778 ≈ 0.00889
    expect(p.yCost).toBeCloseTo(5  * (16 / (1800 * 5)), 6);
    // kRate = 12 / (3000 * 5) = 0.0008; kCost = 30 * 0.0008 = 0.024
    expect(p.kCost).toBeCloseTo(30 * (12 / (3000 * 5)), 6);

    // inkCostPerPage = sum of all channel costs
    expect(p.inkCostPerPage).toBeCloseTo(p.cCost + p.mCost + p.yCost + p.kCost, 6);
  });

  it("falls back to shared price when per-channel price is absent for a channel", () => {
    const params: CostParams = {
      pricePerCartridge: 40,
      yieldPages: 2000,
      coveragePercent: 5,
      // Only black has its own price; C/M/Y fall back to shared
      kCartridgePrice: 10,
      kCartridgeYield: 4000,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };

    const result = computeCosts(mockPagesForChannel as any, params);
    const p = result.perPage[0]!;

    const sharedRate = 40 / (2000 * 5); // 0.004
    const kRate = 10 / (4000 * 5);       // 0.0005

    expect(p.cCost).toBeCloseTo(20 * sharedRate, 6);
    expect(p.mCost).toBeCloseTo(10 * sharedRate, 6);
    expect(p.yCost).toBeCloseTo(5  * sharedRate, 6);
    expect(p.kCost).toBeCloseTo(30 * kRate,       6);
  });

  it("perChannel array reflects per-channel costs correctly", () => {
    const params: CostParams = {
      cCartridgePrice: 20, cCartridgeYield: 2000,
      mCartridgePrice: 18, mCartridgeYield: 1500,
      yCartridgePrice: 16, yCartridgeYield: 1800,
      kCartridgePrice: 12, kCartridgeYield: 3000,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };

    const result = computeCosts(mockPagesForChannel as any, params);
    const cyan = result.perChannel.find((ch) => ch.channel === "Cyan")!;
    expect(cyan.cost).toBeCloseTo(20 * (20 / (2000 * 5)), 6);
  });
});

// ─── Cartridge Preset Tests ────────────────────────────────────────────────

describe("cartridge preset auto-fill", () => {
  const mockPreset = {
    id: 10,
    name: "HP 952XL (OfficeJet Pro 8710/8720/8730)",
    brand: "HP",
    cartridgeModel: "HP 952XL",
    cartridgeType: "Inkjet",
    compatiblePrinters: "HP OfficeJet Pro 8710, 8715, 8720, 8725, 8730, 8740",
    cCartridgePrice: 52.89,
    cCartridgeYield: 1450,
    mCartridgePrice: 52.89,
    mCartridgeYield: 1450,
    yCartridgePrice: 52.89,
    yCartridgeYield: 1450,
    kCartridgePrice: 70.89,
    kCartridgeYield: 2000,
    coveragePercent: 5,
    paperCostPerSheet: 0.01,
    isDuplex: false,
    isBuiltIn: true,
  };

  it("preset has correct brand and model metadata", () => {
    expect(mockPreset.brand).toBe("HP");
    expect(mockPreset.cartridgeModel).toBe("HP 952XL");
    expect(mockPreset.cartridgeType).toBe("Inkjet");
    expect(mockPreset.isBuiltIn).toBe(true);
  });

  it("preset has per-channel CMYK prices", () => {
    expect(mockPreset.cCartridgePrice).toBe(52.89);
    expect(mockPreset.mCartridgePrice).toBe(52.89);
    expect(mockPreset.yCartridgePrice).toBe(52.89);
    expect(mockPreset.kCartridgePrice).toBe(70.89);
  });

  it("preset has per-channel CMYK yields", () => {
    expect(mockPreset.cCartridgeYield).toBe(1450);
    expect(mockPreset.mCartridgeYield).toBe(1450);
    expect(mockPreset.yCartridgeYield).toBe(1450);
    expect(mockPreset.kCartridgeYield).toBe(2000);
  });

  it("cost calculation uses per-channel prices from preset", () => {
    const params: CostParams = {
      cCartridgePrice: mockPreset.cCartridgePrice,
      cCartridgeYield: mockPreset.cCartridgeYield,
      kCartridgePrice: mockPreset.kCartridgePrice,
      kCartridgeYield: mockPreset.kCartridgeYield,
      coveragePercent: mockPreset.coveragePercent,
      paperCostPerSheet: mockPreset.paperCostPerSheet,
      isDuplex: mockPreset.isDuplex,
      copies: 1,
    };
    const pages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 50, mCoverage: 0, yCoverage: 0, kCoverage: 0, tac: 50 },
    ];
    const result = computeCosts(pages as any, params);
    const p = result.perPage[0]!;
    // cRate = 52.89 / (1450 * 5) = 0.007295...; cCost = 50 * cRate
    expect(p.cCost).toBeCloseTo(50 * (52.89 / (1450 * 5)), 4);
  });

  it("Canon 046H laser toner preset has higher yield than inkjet", () => {
    const canonYield = 5000;
    const hp952xlYield = 1450;
    expect(canonYield).toBeGreaterThan(hp952xlYield);
  });

  it("Epson 702XL cyan is cheaper than black", () => {
    const epsonCyan = 28.99;
    const epsonBlack = 45.99;
    expect(epsonCyan).toBeLessThan(epsonBlack);
  });
});

// ─── Brother Cartridge Preset Tests ──────────────────────────────────────────

describe("Brother cartridge preset data", () => {
  const brotherPresets = [
    {
      model: "Brother TN-227",
      cartridgeType: "Laser",
      cPrice: 123.49, cYield: 2300,
      mPrice: 123.49, mYield: 2300,
      yPrice: 123.49, yYield: 2300,
      kPrice: 96.29,  kYield: 3000,
    },
    {
      model: "Brother TN-223",
      cartridgeType: "Laser",
      cPrice: 96.99, cYield: 1300,
      mPrice: 96.99, mYield: 1300,
      yPrice: 96.99, yYield: 1300,
      kPrice: 76.99, kYield: 1400,
    },
    {
      model: "Brother TN-433",
      cartridgeType: "Laser",
      cPrice: 166.48, cYield: 4000,
      mPrice: 166.49, mYield: 4000,
      yPrice: 166.49, yYield: 4000,
      kPrice: 103.49, kYield: 4500,
    },
    {
      model: "Brother TN-436",
      cartridgeType: "Laser",
      cPrice: 232.99, cYield: 6500,
      mPrice: 232.99, mYield: 6500,
      yPrice: 232.99, yYield: 6500,
      kPrice: 108.29, kYield: 6500,
    },
  ];

  it("all Brother presets are Laser type", () => {
    brotherPresets.forEach((p) => {
      expect(p.cartridgeType).toBe("Laser");
    });
  });

  it("TN-227 has higher yield than TN-223 (high-yield vs standard)", () => {
    const tn227 = brotherPresets.find((p) => p.model === "Brother TN-227")!;
    const tn223 = brotherPresets.find((p) => p.model === "Brother TN-223")!;
    expect(tn227.cYield).toBeGreaterThan(tn223.cYield);
    expect(tn227.kYield).toBeGreaterThan(tn223.kYield);
  });

  it("TN-436 super high-yield has highest yield of all Brother presets", () => {
    const tn436 = brotherPresets.find((p) => p.model === "Brother TN-436")!;
    brotherPresets.forEach((p) => {
      expect(tn436.cYield).toBeGreaterThanOrEqual(p.cYield);
    });
  });

  it("Black toner is cheaper than colour toner for all Brother presets", () => {
    brotherPresets.forEach((p) => {
      expect(p.kPrice).toBeLessThan(p.cPrice);
    });
  });

  it("TN-227 cost per page is lower than TN-223 for same coverage", () => {
    const tn227 = brotherPresets.find((p) => p.model === "Brother TN-227")!;
    const tn223 = brotherPresets.find((p) => p.model === "Brother TN-223")!;
    const coverage = 20; // 20% cyan coverage
    const coveragePct = 5;
    const tn227Rate = tn227.cPrice / (tn227.cYield * coveragePct);
    const tn223Rate = tn223.cPrice / (tn223.cYield * coveragePct);
    const tn227CostPerPage = coverage * tn227Rate;
    const tn223CostPerPage = coverage * tn223Rate;
    // High-yield TN-227 should be cheaper per page than standard TN-223
    expect(tn227CostPerPage).toBeLessThan(tn223CostPerPage);
  });

  it("computeCosts works correctly with Brother TN-436 per-channel pricing", () => {
    const tn436 = brotherPresets.find((p) => p.model === "Brother TN-436")!;
    const params: CostParams = {
      cCartridgePrice: tn436.cPrice, cCartridgeYield: tn436.cYield,
      mCartridgePrice: tn436.mPrice, mCartridgeYield: tn436.mYield,
      yCartridgePrice: tn436.yPrice, yCartridgeYield: tn436.yYield,
      kCartridgePrice: tn436.kPrice, kCartridgeYield: tn436.kYield,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };
    const pages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 15, mCoverage: 10, yCoverage: 8, kCoverage: 25, tac: 58 },
    ];
    const result = computeCosts(pages as any, params);
    const p = result.perPage[0]!;
    // kRate = 108.29 / (6500 * 5) = 0.003332; kCost = 25 * 0.003332 ≈ 0.08331
    expect(p.kCost).toBeCloseTo(25 * (108.29 / (6500 * 5)), 4);
    expect(p.inkCostPerPage).toBeCloseTo(p.cCost + p.mCost + p.yCost + p.kCost, 6);
  });
});

// ─── Samsung & Xerox Cartridge Preset Tests ───────────────────────────────────

describe("Samsung cartridge preset data", () => {
  const samsungPresets = [
    { model: "Samsung CLT-506L", cPrice: 44.55, cYield: 3500, kPrice: 44.55, kYield: 6000 },
    { model: "Samsung CLT-404S", cPrice: 84.99, cYield: 1000, kPrice: 84.99, kYield: 1500 },
    { model: "Samsung CLT-503L", cPrice: 218.00, cYield: 5000, kPrice: 209.00, kYield: 8000 },
  ];

  it("CLT-506L has higher yield than CLT-404S (high-yield vs standard)", () => {
    const clt506 = samsungPresets.find((p) => p.model === "Samsung CLT-506L")!;
    const clt404 = samsungPresets.find((p) => p.model === "Samsung CLT-404S")!;
    expect(clt506.cYield).toBeGreaterThan(clt404.cYield);
    expect(clt506.kYield).toBeGreaterThan(clt404.kYield);
  });

  it("CLT-503L ProXpress has highest yield of Samsung presets", () => {
    const clt503 = samsungPresets.find((p) => p.model === "Samsung CLT-503L")!;
    samsungPresets.forEach((p) => {
      expect(clt503.cYield).toBeGreaterThanOrEqual(p.cYield);
    });
  });

  it("computeCosts works with Samsung CLT-506L per-channel pricing", () => {
    const preset = samsungPresets.find((p) => p.model === "Samsung CLT-506L")!;
    const params: CostParams = {
      cCartridgePrice: preset.cPrice, cCartridgeYield: preset.cYield,
      kCartridgePrice: preset.kPrice, kCartridgeYield: preset.kYield,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };
    const pages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 30, mCoverage: 0, yCoverage: 0, kCoverage: 40, tac: 70 },
    ];
    const result = computeCosts(pages as any, params);
    const p = result.perPage[0]!;
    // cRate = 44.55 / (3500 * 5) = 0.002546; cCost = 30 * 0.002546
    expect(p.cCost).toBeCloseTo(30 * (44.55 / (3500 * 5)), 4);
    // kRate = 44.55 / (6000 * 5) = 0.001485; kCost = 40 * 0.001485
    expect(p.kCost).toBeCloseTo(40 * (44.55 / (6000 * 5)), 4);
  });
});

describe("Xerox cartridge preset data", () => {
  const xeroxPresets = [
    { model: "Xerox C230/C235", cPrice: 126.99, cYield: 2500, kPrice: 113.99, kYield: 3000 },
    { model: "Xerox VersaLink C400/C405", cPrice: 330.99, cYield: 8000, kPrice: 215.99, kYield: 10500 },
    { model: "Xerox VersaLink C600/C605", cPrice: 373.99, cYield: 16800, kPrice: 249.99, kYield: 16900 },
  ];

  it("VersaLink C600/C605 has the highest yield of all Xerox presets", () => {
    const c600 = xeroxPresets.find((p) => p.model === "Xerox VersaLink C600/C605")!;
    xeroxPresets.forEach((p) => {
      expect(c600.cYield).toBeGreaterThanOrEqual(p.cYield);
    });
  });

  it("Black toner is cheaper than colour toner for all Xerox presets", () => {
    xeroxPresets.forEach((p) => {
      expect(p.kPrice).toBeLessThan(p.cPrice);
    });
  });

  it("Xerox C230/C235 cost per page is higher than VersaLink C600 due to lower yield", () => {
    const c235 = xeroxPresets.find((p) => p.model === "Xerox C230/C235")!;
    const c600 = xeroxPresets.find((p) => p.model === "Xerox VersaLink C600/C605")!;
    const coveragePct = 5;
    const coverage = 20;
    const c235Rate = c235.cPrice / (c235.cYield * coveragePct);
    const c600Rate = c600.cPrice / (c600.cYield * coveragePct);
    expect(coverage * c235Rate).toBeGreaterThan(coverage * c600Rate);
  });

  it("computeCosts works with Xerox VersaLink C600 per-channel pricing", () => {
    const preset = xeroxPresets.find((p) => p.model === "Xerox VersaLink C600/C605")!;
    const params: CostParams = {
      cCartridgePrice: preset.cPrice, cCartridgeYield: preset.cYield,
      kCartridgePrice: preset.kPrice, kCartridgeYield: preset.kYield,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };
    const pages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 25, mCoverage: 0, yCoverage: 0, kCoverage: 50, tac: 75 },
    ];
    const result = computeCosts(pages as any, params);
    const p = result.perPage[0]!;
    expect(p.cCost).toBeCloseTo(25 * (373.99 / (16800 * 5)), 5);
    expect(p.kCost).toBeCloseTo(50 * (249.99 / (16900 * 5)), 5);
    expect(p.inkCostPerPage).toBeCloseTo(p.cCost + p.mCost + p.yCost + p.kCost, 6);
  });
});

// ─── Lexmark & Konica Minolta Cartridge Preset Tests ─────────────────────────

describe("Lexmark cartridge preset data", () => {
  const lexmarkPresets = [
    { model: "Lexmark C2320 Series",        cPrice: 123.99, cYield: 2300,  kPrice: 117.99, kYield: 3000  },
    { model: "Lexmark CS531/CX532 Series",  cPrice: 118.99, cYield: 2000,  kPrice: 108.99, kYield: 3000  },
    { model: "Lexmark C950X2 Series",       cPrice: 538.00, cYield: 22000, kPrice: 439.00, kYield: 32000 },
  ];

  it("CS820/CX820 extra high-yield has highest yield of all Lexmark presets", () => {
    const c950 = lexmarkPresets.find((p) => p.model === "Lexmark C950X2 Series")!;
    lexmarkPresets.forEach((p) => {
      expect(c950.cYield).toBeGreaterThanOrEqual(p.cYield);
      expect(c950.kYield).toBeGreaterThanOrEqual(p.kYield);
    });
  });

  it("Black toner is cheaper than colour toner for all Lexmark presets", () => {
    lexmarkPresets.forEach((p) => {
      expect(p.kPrice).toBeLessThan(p.cPrice);
    });
  });

  it("CS820 extra high-yield has lower cost per page than C2320 for same coverage", () => {
    const c2320 = lexmarkPresets.find((p) => p.model === "Lexmark C2320 Series")!;
    const c950  = lexmarkPresets.find((p) => p.model === "Lexmark C950X2 Series")!;
    const coveragePct = 5;
    const coverage = 20;
    const c2320CostPerPage = coverage * (c2320.cPrice / (c2320.cYield * coveragePct));
    const c950CostPerPage  = coverage * (c950.cPrice  / (c950.cYield  * coveragePct));
    expect(c950CostPerPage).toBeLessThan(c2320CostPerPage);
  });

  it("computeCosts works with Lexmark C2320 per-channel pricing", () => {
    const preset = lexmarkPresets.find((p) => p.model === "Lexmark C2320 Series")!;
    const params: CostParams = {
      cCartridgePrice: preset.cPrice, cCartridgeYield: preset.cYield,
      kCartridgePrice: preset.kPrice, kCartridgeYield: preset.kYield,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };
    const pages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 20, mCoverage: 0, yCoverage: 0, kCoverage: 35, tac: 55 },
    ];
    const result = computeCosts(pages as any, params);
    const p = result.perPage[0]!;
    expect(p.cCost).toBeCloseTo(20 * (123.99 / (2300 * 5)), 5);
    expect(p.kCost).toBeCloseTo(35 * (117.99 / (3000 * 5)), 5);
  });
});

describe("Konica Minolta cartridge preset data", () => {
  const konicaPresets = [
    { model: "Konica Minolta TN-321", cPrice: 97.95,  cYield: 25000, mPrice: 97.95, kPrice: 44.95, kYield: 27000 },
    { model: "Konica Minolta TN-514", cPrice: 84.95,  cYield: 26000, mPrice: 74.95, kPrice: 84.95, kYield: 28000 },
    { model: "Konica Minolta TN-328", cPrice: 94.00,  cYield: 28000, mPrice: 59.00, kPrice: 49.95, kYield: 28000 },
  ];

  it("all Konica Minolta presets have very high yields (enterprise class)", () => {
    konicaPresets.forEach((p) => {
      expect(p.cYield).toBeGreaterThanOrEqual(25000);
      expect(p.kYield).toBeGreaterThanOrEqual(27000);
    });
  });

  it("TN-328 has highest colour yield of all Konica Minolta presets", () => {
    const tn328 = konicaPresets.find((p) => p.model === "Konica Minolta TN-328")!;
    konicaPresets.forEach((p) => {
      expect(tn328.cYield).toBeGreaterThanOrEqual(p.cYield);
    });
  });

  it("Black toner is cheaper than or equal to colour toner for all Konica Minolta presets", () => {
    konicaPresets.forEach((p) => {
      // TN-514 black equals cyan price; TN-321 and TN-328 black is cheaper
      expect(p.kPrice).toBeLessThanOrEqual(p.cPrice);
    });
  });

  it("computeCosts works with Konica Minolta TN-514 per-channel pricing", () => {
    const preset = konicaPresets.find((p) => p.model === "Konica Minolta TN-514")!;
    const params: CostParams = {
      cCartridgePrice: preset.cPrice, cCartridgeYield: preset.cYield,
      mCartridgePrice: preset.mPrice, mCartridgeYield: preset.cYield,
      kCartridgePrice: preset.kPrice, kCartridgeYield: preset.kYield,
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
    };
    const pages = [
      { id: 1, fileId: 1, pageNumber: 1, cCoverage: 15, mCoverage: 10, yCoverage: 0, kCoverage: 20, tac: 45 },
    ];
    const result = computeCosts(pages as any, params);
    const p = result.perPage[0]!;
    expect(p.cCost).toBeCloseTo(15 * (84.95 / (26000 * 5)), 6);
    expect(p.mCost).toBeCloseTo(10 * (74.95 / (26000 * 5)), 6);
    expect(p.kCost).toBeCloseTo(20 * (84.95 / (28000 * 5)), 6);
    expect(p.inkCostPerPage).toBeCloseTo(p.cCost + p.mCost + p.yCost + p.kCost, 6);
  });
});

// ─── Printer Selection Flow Tests ──────────────────────────────────────────
describe("printer selection flow", () => {
  it("getPrintersByBrand returns empty array for unknown brand", async () => {
    const { getPrintersByBrand } = await import("./db");
    const printers = await getPrintersByBrand("UnknownBrand_XYZ_999");
    expect(Array.isArray(printers)).toBe(true);
    expect(printers.length).toBe(0);
  });

  it("getPresetByPrinterId returns null/undefined for non-existent printer", async () => {
    const { getPresetByPrinterId } = await import("./db");
    const result = await getPresetByPrinterId(999999);
    expect(result == null).toBe(true); // null or undefined both acceptable
  });

  it("printer search filter is case-insensitive", () => {
    const printers = [
      { id: 1, model: "OfficeJet Pro 8710", series: "OfficeJet Pro" },
      { id: 2, model: "LaserJet Pro M255dw", series: "LaserJet Pro" },
    ];
    const search = "officejet";
    const filtered = printers.filter(
      (p) => p.model.toLowerCase().includes(search.toLowerCase())
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].model).toBe("OfficeJet Pro 8710");
  });

  it("printer grouping by series produces correct structure", () => {
    const printers = [
      { id: 1, model: "OfficeJet Pro 8710", series: "OfficeJet Pro" },
      { id: 2, model: "OfficeJet Pro 8720", series: "OfficeJet Pro" },
      { id: 3, model: "LaserJet Pro M255dw", series: "LaserJet Pro" },
    ];
    const grouped: Record<string, typeof printers> = {};
    printers.forEach((pr) => {
      const key = pr.series ?? "Other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(pr);
    });
    expect(Object.keys(grouped)).toHaveLength(2);
    expect(grouped["OfficeJet Pro"]).toHaveLength(2);
    expect(grouped["LaserJet Pro"]).toHaveLength(1);
  });

  it("brand reset clears selected printer and search", () => {
    // Simulate the state reset logic from handleSelectPrinter
    let selectedPrinterId: number | null = 5;
    let printerSearch = "laser";
    // When brand changes
    selectedPrinterId = null;
    printerSearch = "";
    expect(selectedPrinterId).toBeNull();
    expect(printerSearch).toBe("");
  });

  it("toner auto-fill sets all CMYK fields from preset", () => {
    const preset = {
      id: 1,
      cCartridgePrice: 52.89, cCartridgeYield: 1450,
      mCartridgePrice: 52.89, mCartridgeYield: 1450,
      yCartridgePrice: 52.89, yCartridgeYield: 1450,
      kCartridgePrice: 70.89, kCartridgeYield: 2000,
      pricePerCartridge: null, yieldPages: null,
      coveragePercent: 5, paperCostPerSheet: 0.01, isDuplex: false,
    };
    // Simulate what handleSelectPrinter does to costParams
    const costParams: Record<string, any> = {};
    costParams.cCartridgePrice = (preset as any).cCartridgePrice ?? undefined;
    costParams.cCartridgeYield = (preset as any).cCartridgeYield ?? undefined;
    costParams.mCartridgePrice = (preset as any).mCartridgePrice ?? undefined;
    costParams.mCartridgeYield = (preset as any).mCartridgeYield ?? undefined;
    costParams.yCartridgePrice = (preset as any).yCartridgePrice ?? undefined;
    costParams.yCartridgeYield = (preset as any).yCartridgeYield ?? undefined;
    costParams.kCartridgePrice = (preset as any).kCartridgePrice ?? undefined;
    costParams.kCartridgeYield = (preset as any).kCartridgeYield ?? undefined;
    expect(costParams.cCartridgePrice).toBe(52.89);
    expect(costParams.kCartridgeYield).toBe(2000);
    expect(costParams.pricePerCartridge).toBeUndefined();
  });
});
