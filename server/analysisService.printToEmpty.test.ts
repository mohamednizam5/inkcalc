import { describe, expect, it } from "vitest";
import { computeCosts } from "./analysisService";

const pages = [
  {
    id: 1,
    fileId: 1,
    pageNumber: 1,
    cCoverage: 5,
    mCoverage: 5,
    yCoverage: 5,
    kCoverage: 5,
    tac: 20,
    rCoverage: 0,
    gCoverage: 0,
    bCoverage: 0,
  },
];

describe("Print to Empty", () => {
  it("uses the tri-colour cartridge as the limiting reservoir and preserves a 10% reserve", () => {
    const result = computeCosts(pages, {
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
      printerType: "2-cartridge",
      cartridges: [
        { id: "black", label: "Black", channels: ["K"], blended: false, price: 10, yield: 100 },
        { id: "colour", label: "Colour", channels: ["C", "M", "Y"], blended: true, price: 10, yield: 100 },
      ],
      remainingInkPercent: { black: 100, colour: 50 },
    });

    expect(result.printToEmpty.isReady).toBe(true);
    expect(result.printToEmpty.maximumCompleteCopies).toBe(16);
    expect(result.printToEmpty.recommendedCopies).toBe(14);
    expect(result.printToEmpty.limitingCartridge).toEqual({ id: "colour", label: "Colour" });
  });

  it("reports zero printable copies when the limiting cartridge is empty", () => {
    const result = computeCosts(pages, {
      coveragePercent: 5,
      paperCostPerSheet: 0.01,
      isDuplex: false,
      copies: 1,
      printerType: "2-cartridge",
      cartridges: [
        { id: "black", label: "Black", channels: ["K"], blended: false, price: 10, yield: 100 },
        { id: "colour", label: "Colour", channels: ["C", "M", "Y"], blended: true, price: 10, yield: 100 },
      ],
      remainingInkPercent: { black: 100, colour: 0 },
    });

    expect(result.printToEmpty.isReady).toBe(true);
    expect(result.printToEmpty.maximumCompleteCopies).toBe(0);
    expect(result.printToEmpty.recommendedCopies).toBe(0);
    expect(result.printToEmpty.limitingCartridge?.id).toBe("colour");
  });
});
