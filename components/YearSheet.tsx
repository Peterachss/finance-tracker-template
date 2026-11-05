"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MonthDetail } from "@/components/MonthDetail";
import { YearOverview } from "@/components/YearOverview";
import { SheetTitle } from "@/components/sheet";
import { currentMonthKey } from "@/lib/dates";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Expense Tracker: the whole year in the Google Sheets template, with a month
 * picker beside the year. Choosing a month (or clicking its name in the
 * sheet) opens that month day by day; "Whole year" goes back.
 */
export function YearSheet() {
  const [year, setYear] = useState(() => Number(currentMonthKey().slice(0, 4)));
  const [monthIndex, setMonthIndex] = useState<number | null>(null);
  const month = monthIndex === null ? null : `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-5">
      <SheetTitle
        title={month ? `Expense Tracker · ${MONTH_NAMES[monthIndex!]} ${year}` : `Expense Tracker ${year}`}
        subtitle={month ? "Every payment this month, newest first" : "Calculated from your saved transactions · click a month to see it in full"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="tracker-month">Month</label>
            <select
              id="tracker-month"
              value={monthIndex ?? ""}
              onChange={(e) => setMonthIndex(e.target.value === "" ? null : Number(e.target.value))}
              className="h-10 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] font-medium"
            >
              <option value="">Whole year</option>
              {MONTH_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
            </select>
            <div className="flex items-center gap-1 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
              <button type="button" aria-label="Previous year" onClick={() => setYear((y) => y - 1)} className="grid size-8 place-items-center rounded-[8px] hover:bg-[var(--surface-sunken)]"><ChevronLeft className="size-4" /></button>
              <span className="tnum w-12 text-center text-[14px] font-medium">{year}</span>
              <button type="button" aria-label="Next year" onClick={() => setYear((y) => y + 1)} className="grid size-8 place-items-center rounded-[8px] hover:bg-[var(--surface-sunken)]"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        }
      />
      {month ? (
        <>
          <button type="button" onClick={() => setMonthIndex(null)} className="-mt-2 inline-flex items-center gap-1 self-start text-[13px] font-medium text-[var(--accent)] hover:underline">
            <ChevronLeft className="size-4" />Back to whole year
          </button>
          <MonthDetail month={month} />
        </>
      ) : (
        <YearOverview year={year} onPickMonth={setMonthIndex} />
      )}
    </div>
  );
}
