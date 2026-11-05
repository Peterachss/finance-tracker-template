"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentMonthKey, monthLabel, shiftMonth } from "@/lib/dates";
import { CURRENCIES, formatMinorPlain } from "@/lib/money";
import type { CurrencyCode } from "@/lib/types";

/**
 * Shared pieces for every Sheets-style table (Expense tracker, Allowance,
 * Dream list) so they read as one workbook: same title bar, month switcher,
 * grid, header fills, money cells and summary rows, in both themes.
 */

export const sheetCell = "h-[30px] border-b border-r border-[var(--sheet-grid)] px-2 text-[13px] leading-[30px] whitespace-nowrap";
export const sheetNum = "w-10 border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] text-[var(--text-muted)]";
export const sheetLetter = "h-[22px] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] font-normal text-[var(--text-muted)]";
/** Pastel header fill with dark ink, readable in light and dark mode. */
export const sheetHead = `${sheetCell} text-left font-semibold text-[#111816]`;
/** Summary rows use theme tokens so they never glare in dark mode. */
export const sheetTotal = `${sheetCell} bg-[var(--surface-sunken)] font-semibold`;
export const sheetGoal = `${sheetCell} bg-[var(--accent-soft)] font-semibold text-[var(--accent)]`;
/** One-green header: the forest Sheets header row with white text. */
export const sheetHeadGreen = `${sheetCell} bg-[var(--sheet-header)] text-left font-semibold text-white`;

/** Google Sheets "light 2" swatches. */
export const PASTELS = ["#f4cccc", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#a4c2f4", "#ea9999", "#fce5cd", "#b4a7d6", "#d5a6bd", "#6d9eeb"];
export const MARKS = ["#e6a1a1", "#f2a96b", "#f1cf5a", "#8fc27c", "#76a7ae", "#6fa8dc", "#7aa0e8", "#d46a6a", "#f6c99a", "#8e7cc3", "#c27ba0", "#3c78d8"];

export function columnLetter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(39 + i);
}

export function currencySymbol(currency: CurrencyCode): string {
  return (
    new Intl.NumberFormat(CURRENCIES[currency].locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/** Accounting format: figure right-aligned, "–" for zero, (x) for negatives, symbol only when there is a value. */
export function SheetMoney({ minor, currency, bold = false }: { minor: number; currency: CurrencyCode; bold?: boolean }) {
  if (minor === 0) return <span className="block text-right text-[var(--text-faint)]">–</span>;
  const body = minor < 0 ? `(${formatMinorPlain(-minor, currency)})` : formatMinorPlain(minor, currency);
  return (
    <span className={`flex items-baseline justify-between gap-2 ${bold ? "font-semibold" : ""}`}>
      <span className="text-[var(--text-faint)]">{currencySymbol(currency)}</span>
      <span className="tnum">{body}</span>
    </span>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const isCurrent = month === currentMonthKey();
  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
      <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))} className="grid size-8 place-items-center rounded-[8px] hover:bg-[var(--surface-sunken)]">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-[120px] text-center text-[14px] font-medium">{monthLabel(month)}</span>
      <button type="button" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))} className="grid size-8 place-items-center rounded-[8px] hover:bg-[var(--surface-sunken)]">
        <ChevronRight className="size-4" />
      </button>
      {!isCurrent ? (
        <button type="button" onClick={() => onChange(currentMonthKey())} className="ml-1 rounded-[8px] px-2 py-1 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]">
          Today
        </button>
      ) : null}
    </div>
  );
}

export function SheetTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-[8px] bg-[var(--accent)] text-[var(--on-accent)]">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 9v12" /></svg>
        </span>
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
          {subtitle ? <p className="text-[12px] text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/** The bordered, scrollable sheet frame. */
export function SheetFrame({ children, label, minWidth }: { children: ReactNode; label: string; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-[var(--sheet-grid)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <table className="w-full border-separate border-spacing-0" style={minWidth ? { minWidth } : undefined} aria-label={label}>
        {children}
      </table>
    </div>
  );
}
