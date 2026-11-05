import { MINOR_SCALE, type CurrencyCode } from "./types";

export { MINOR_SCALE };

/** Decimal places held by one minor unit (100 => 2 decimals). */
export const MINOR_DECIMALS = 2;

/**
 * Money helpers. All arithmetic happens on integers of minor units (scale 100).
 * Conversion to and from the database's `numeric(18,2)` uses string math only.
 */

export interface CurrencyInfo {
  code: CurrencyCode;
  label: string;
  /** Display decimals. VND is 0, USD/AUD are 2. */
  decimals: number;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  VND: { code: "VND", label: "Vietnamese dong", decimals: 0, locale: "vi-VN" },
  USD: { code: "USD", label: "US dollar", decimals: 2, locale: "en-US" },
  AUD: { code: "AUD", label: "Australian dollar", decimals: 2, locale: "en-AU" },
};

export const CURRENCY_CODES: CurrencyCode[] = ["VND", "USD", "AUD"];

/** Convert minor units (scale 100) to an exact `numeric` decimal string. */
export function minorToDecimalString(minor: number): string {
  assertSafeMinor(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / MINOR_SCALE);
  const frac = abs % MINOR_SCALE;
  return `${negative ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

/**
 * Parse a plain `numeric` decimal string from the database into minor units.
 * Rejects anything that is not a simple decimal literal so that malformed data
 * can never silently become 0.
 */
export function decimalStringToMinor(value: string | number): number {
  const raw = typeof value === "number" ? String(value) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw new Error(`Invalid decimal amount: ${JSON.stringify(raw)}`);
  const sign = match[1] === "-" ? -1 : 1;
  const whole = match[2];
  const frac = (match[3] ?? "").padEnd(2, "0");
  const minor = sign * (Number(whole) * MINOR_SCALE + Number(frac));
  assertSafeMinor(minor);
  return minor;
}

function assertSafeMinor(minor: number): void {
  if (!Number.isFinite(minor) || !Number.isSafeInteger(minor)) {
    throw new Error(`Amount is not a safe integer of minor units: ${minor}`);
  }
}

export function sumMinor(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  assertSafeMinor(total);
  return total;
}

/** Round half away from zero to the currency's display precision. */
export function roundToDisplayDecimals(minor: number, decimals: number): number {
  const step = 10 ** (MINOR_DECIMALS - decimals);
  if (step <= 1) return minor;
  return Math.sign(minor) * Math.round(Math.abs(minor) / step) * step;
}

export function formatMinor(
  minor: number,
  currency: CurrencyCode,
  options: { signed?: boolean; compact?: boolean; symbol?: boolean } = {},
): string {
  const info = CURRENCIES[currency];
  const rounded = roundToDisplayDecimals(minor, info.decimals);
  const value = rounded / MINOR_SCALE;
  if (options.symbol) {
    // Headline style: "$26,887.09" / "₫1.250.000", sign before the symbol.
    const symbolic = new Intl.NumberFormat(info.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: options.compact ? 0 : info.decimals,
      maximumFractionDigits: options.compact ? 0 : info.decimals,
      notation: options.compact ? "compact" : "standard",
    }).format(Math.abs(value));
    if (rounded < 0) return `-${symbolic}`;
    if (options.signed && rounded > 0) return `+${symbolic}`;
    return symbolic;
  }
  const formatter = new Intl.NumberFormat(info.locale, {
    minimumFractionDigits: options.compact ? 0 : info.decimals,
    maximumFractionDigits: options.compact ? 0 : info.decimals,
    notation: options.compact ? "compact" : "standard",
  });
  const body = `${formatter.format(Math.abs(value))} ${currency}`;
  // Compact output drops decimals, so a few cents would otherwise print as "-0".
  if (options.compact && Math.abs(value) < 0.5) return body;
  if (rounded < 0) return `-${body}`;
  if (options.signed && rounded > 0) return `+${body}`;
  return body;
}

/** Plain number without currency symbol, used inside grid cells. */
export function formatMinorPlain(minor: number, currency: CurrencyCode): string {
  const info = CURRENCIES[currency];
  const value = roundToDisplayDecimals(minor, info.decimals) / MINOR_SCALE;
  return new Intl.NumberFormat(info.locale, {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  }).format(value);
}