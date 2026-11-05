import { describe, expect, it } from "vitest";
import { monthlyCost, nextDueDate } from "../lib/collections";
import { parseMoney } from "../components/planning-ui";

describe("parseMoney", () => {
  it("reads Vietnamese and English shorthand", () => {
    expect(parseMoney("600k")).toBe(600_000 * 100);
    expect(parseMoney("2tr")).toBe(2_000_000 * 100);
    expect(parseMoney("6.6m")).toBe(6_600_000 * 100);
    expect(parseMoney("1,5tr")).toBe(1_500_000 * 100);
  });
  it("reads plain grouped amounts and rejects nonsense", () => {
    expect(parseMoney("45,000")).toBe(45_000 * 100);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("0")).toBeNull();
  });
});

describe("bills", () => {
  it("moves the due date by one cycle and clamps month ends", () => {
    expect(nextDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextDueDate("2026-10-13", "weekly")).toBe("2026-10-20");
    expect(nextDueDate("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(nextDueDate("2024-02-29", "yearly")).toBe("2025-02-28");
  });
  it("spreads non-monthly bills into a monthly cost", () => {
    expect(monthlyCost({ amount: 1200, cycle: "yearly" })).toBe(100);
    expect(monthlyCost({ amount: 300, cycle: "quarterly" })).toBe(100);
    expect(monthlyCost({ amount: 500, cycle: "monthly" })).toBe(500);
  });
});

