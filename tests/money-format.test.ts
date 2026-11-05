import { describe, expect, it } from "vitest";
import { CURRENCY_CODES, formatMinor, formatMinorPlain } from "../lib/money";

const SAMPLES = [0, 1, 49, 50, 99, 100, 12345, 123456789, 99999999999, -1, -50, -100, -123456789];

describe("money formatting never renders garbage", () => {
  for (const currency of CURRENCY_CODES) {
    for (const minor of SAMPLES) {
      for (const compact of [false, true]) {
        it(`${currency} ${minor} compact=${compact}`, () => {
          const text = formatMinor(minor, currency, { compact });
          expect(text).toMatch(/\d/);
          expect(text).not.toMatch(/NaN|undefined|Infinity|\[object/);
          expect(text.endsWith(currency)).toBe(true);
          expect(text).not.toMatch(/^-0(?![\d.,])/);
        });
      }
    }
  }

  it("zero and sub-display-unit negatives are never shown as -0", () => {
    expect(formatMinor(0, "USD")).toBe("0.00 USD");
    expect(formatMinor(-1, "USD")).toBe("-0.01 USD");
    expect(formatMinor(-40, "VND").startsWith("-")).toBe(false);
  });

  it("signed output marks only non-zero positives", () => {
    expect(formatMinor(100, "USD", { signed: true })).toBe("+1.00 USD");
    expect(formatMinor(0, "USD", { signed: true })).toBe("0.00 USD");
    expect(formatMinor(-100, "USD", { signed: true })).toBe("-1.00 USD");
  });

  it("plain grid format agrees with the full format on the digits", () => {
    for (const currency of CURRENCY_CODES) {
      for (const minor of SAMPLES) {
        const plain = formatMinorPlain(minor, currency);
        expect(plain).not.toMatch(/NaN|undefined|Infinity/);
        expect(formatMinor(minor, currency)).toContain(plain.replace(/^-/, ""));
      }
    }
  });
});
