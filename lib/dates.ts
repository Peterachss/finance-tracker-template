/**
 * Date-only helpers.
 *
 * Every financial date in this app is a calendar date stored as an ISO
 * `YYYY-MM-DD` string. There is no time component and no timezone, so range
 * filters use an INCLUSIVE start and EXCLUSIVE end (`start <= date < end`),
 * which is exactly how string comparison of ISO dates behaves.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month1to12 - 1];
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse user-supplied date text.
 *
 * Accepted unambiguously:
 *   - ISO: 2026-04-13, 2026/04/13
 *   - Day-first where the first part cannot be a month: 13/04/2026
 *   - Month-first where the second part cannot be a month: 04/13/2026
 *   - Excel serial numbers, only when `allowExcelSerial` is set
 *
 * Anything ambiguous (03/04/2026) is REJECTED rather than guessed from locale.
 */
export function parseDateInput(
  raw: string,
  options: { allowExcelSerial?: boolean } = {},
): Result<string> {
  const value = raw.trim();
  if (value === "") return { ok: false, reason: "Date is empty" };

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (iso) {
    const [, y, m, d] = iso;
    return buildIso(Number(y), Number(m), Number(d));
  }

  const slash = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
  if (slash) {
    const [, a, b, y] = slash;
    const first = Number(a);
    const second = Number(b);
    if (first > 12 && second <= 12) return buildIso(Number(y), second, first);
    if (second > 12 && first <= 12) return buildIso(Number(y), first, second);
    return {
      ok: false,
      reason: `Ambiguous date "${value}" — it could be DD/MM/YYYY or MM/DD/YYYY. Use YYYY-MM-DD.`,
    };
  }

  if (options.allowExcelSerial && /^\d{4,6}$/.test(value)) {
    const serial = Number(value);
    const ms = (serial - 25569) * 86_400_000;
    if (serial >= 25569 && serial <= 2_958_465) {
      const date = new Date(ms);
      return buildIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    return { ok: false, reason: `Excel serial ${value} is out of range` };
  }

  return {
    ok: false,
    reason: `Unrecognised date "${value}". Use YYYY-MM-DD.`,
  };
}

function buildIso(year: number, month: number, day: number): Result<string> {
  if (year < 1900 || year > 9999) return { ok: false, reason: `Year ${year} is out of range` };
  if (month < 1 || month > 12) return { ok: false, reason: `Month ${month} is out of range` };
  if (day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, reason: `Day ${day} is out of range for ${year}-${month}` };
  }
  return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
}

/** `YYYY-MM` for an ISO date. */
export function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Inclusive start, exclusive end for the given `YYYY-MM`. */
export function monthRange(month: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month key: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]);
  const nextYear = index === 12 ? year + 1 : year;
  const nextMonth = index === 12 ? 1 : index + 1;
  return {
    start: `${year}-${pad2(index)}-01`,
    end: `${nextYear}-${pad2(nextMonth)}-01`,
  };
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const { start } = monthRange(month);
  const year = Number(start.slice(0, 4));
  const index = Number(start.slice(5, 7));
  const zero = year * 12 + (index - 1) + delta;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return `${y}-${pad2(m)}`;
}

export function monthLabel(month: string, locale = "en-US"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Inclusive start, exclusive end. */
export function isInRange(date: string, start: string, end: string): boolean {
  return date >= start && date < end;
}

/** Shift an ISO date by whole days, staying in UTC so no timezone can creep in. */
export function addDays(isoDate: string, delta: number): string {
  if (!isIsoDate(isoDate)) throw new Error(`Invalid ISO date: ${isoDate}`);
  const ms = Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)));
  const shifted = new Date(ms + delta * 86_400_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** "4 Mar" — the short axis label used by the day-range chart. */
export function shortDayLabel(isoDate: string, locale = "en-US"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Fri, 24 Oct 2026" — a full date for read-only statements. */
export function longDayLabel(isoDate: string, locale = "en-GB"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Jan" — the short axis label used by the month-range chart. */
export function shortMonthLabel(month: string, locale = "en-US"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    timeZone: "UTC",
  });
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}