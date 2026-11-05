"use client";

import { useMemo, useState } from "react";
import { BUCKET_SPEC, useCollection, type Bucket } from "@/lib/collections";
import { currentMonthKey, monthRange } from "@/lib/dates";
import { CURRENCIES, formatMinorPlain } from "@/lib/money";
import { activeCategories, useWorkspace } from "@/lib/store";
import type { CurrencyCode, Transaction } from "@/lib/types";

/**
 * Yearly expense tracker, laid out like the Deborah Ho Google Sheets
 * template: months down, categories across in Sheets' light pastel fills,
 * accounting-format cells, red fill where a month beat its budget, a Total
 * row, a Monthly Budget row, then Total Expenditure / Income / Gross Savings.
 * Under it, the two embedded charts: Yearly Breakdown and Categories.
 */

/** Google Sheets "light 2" swatches, in the template's column order. */
const PASTELS = ["#f4cccc", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#9fc5e8", "#a4c2f4", "#ea9999", "#fce5cd", "#b4a7d6", "#d5a6bd", "#6d9eeb"];
/** Stronger versions of the same hues for the chart marks. */
const MARKS = ["#e6a1a1", "#f2a96b", "#f1cf5a", "#8fc27c", "#76a7ae", "#6fa8dc", "#7aa0e8", "#d46a6a", "#f6c99a", "#8e7cc3", "#c27ba0", "#3c78d8"];
const OVER = "#e6a5a5";
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const COL_LETTERS = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(39 + i));

export function symbolOf(currency: CurrencyCode): string {
  return (
    new Intl.NumberFormat(CURRENCIES[currency].locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

/** Accounting format: symbol pinned left, figure right, "-" for zero, (x) for negatives. */
export function Money({ minor, currency, bold = false }: { minor: number; currency: CurrencyCode; bold?: boolean }) {
  const body = minor === 0 ? "-" : minor < 0 ? `(${formatMinorPlain(-minor, currency)})` : formatMinorPlain(minor, currency);
  return (
    <span className={`flex items-baseline justify-between gap-2 ${bold ? "font-semibold" : ""}`}>
      <span>{symbolOf(currency)}</span>
      <span className="tnum">{body}</span>
    </span>
  );
}

function sumWhere(txs: Transaction[], pred: (t: Transaction) => boolean) {
  let total = 0;
  for (const t of txs) if (pred(t)) total += t.amount;
  return total;
}

export function YearOverview({ year, onPickMonth }: { year: number; onPickMonth: (monthIndex: number) => void }) {
  const { transactions, categories, budgets, currency } = useWorkspace();
  const jars = useCollection<Bucket>({ ...BUCKET_SPEC });
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);

  const cats = useMemo(() => activeCategories(categories).filter((c) => c.kind === "expense"), [categories]);
  const months = useMemo(() => MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`), [year]);

  const grid = useMemo(() => {
    return months.map((m) => {
      const { start, end } = monthRange(m);
      const inMonth = transactions.filter((t) => t.date >= start && t.date < end);
      const byCat = cats.map((c) => sumWhere(inMonth, (t) => t.type === "expense" && t.category_id === c.id));
      const uncategorised = sumWhere(inMonth, (t) => t.type === "expense" && (!t.category_id || !cats.some((c) => c.id === t.category_id)));
      const spent = byCat.reduce((a, b) => a + b, 0) + uncategorised;
      const income = sumWhere(inMonth, (t) => t.type === "income");
      return { month: m, byCat, uncategorised, spent, income, savings: income - spent };
    });
  }, [months, transactions, cats]);

  /** Budget per category: that month's budget, else the allowance jar on that category. */
  const budgetFor = (month: string, categoryId: string | null) => {
    const b = budgets.find((x) => x.month === month && x.category_id === categoryId);
    if (b) return b.amount;
    if (categoryId === null) {
      const jarTotal = jars.rows.filter((j) => !j.is_saving).reduce((a, j) => a + j.amount, 0);
      return jarTotal || null;
    }
    return jars.rows.find((j) => j.category_id === categoryId)?.amount ?? null;
  };
  const shownMonth = currentMonthKey().startsWith(String(year)) ? currentMonthKey() : `${year}-12`;
  const budgetRow = cats.map((c) => budgetFor(shownMonth, c.id));
  const overallBudget = budgetFor(shownMonth, null);

  const colTotals = cats.map((_, i) => grid.reduce((a, r) => a + r.byCat[i], 0));
  const otherTotal = grid.reduce((a, r) => a + r.uncategorised, 0);
  const spentTotal = grid.reduce((a, r) => a + r.spent, 0);
  const incomeTotal = grid.reduce((a, r) => a + r.income, 0);
  const showOther = otherTotal > 0;

  // Column model (A = Month): categories, optional "Uncategorised", then totals.
  const extra = ["Total Expenditure", "Income", "Gross Savings"];
  const columnCount = 1 + cats.length + (showOther ? 1 : 0) + extra.length;
  const catWidth = 112;

  const cell = "h-[26px] border-b border-r border-[var(--sheet-grid)] px-1.5 text-[12px] leading-[26px] whitespace-nowrap";
  const select = (r: number, c: number) => () => setActive({ r, c });
  const isActive = (r: number, c: number) => active?.r === r && active.c === c;
  const ring = "relative z-[1] outline outline-2 -outline-offset-2 outline-[var(--sheet-select)]";

  // Chart data.
  const maxSpent = Math.max(1, ...grid.map((r) => r.spent));
  const donut = [...cats.map((c, i) => ({ name: c.name, value: colTotals[i], colour: MARKS[i % MARKS.length] })), ...(showOther ? [{ name: "Uncategorised", value: otherTotal, colour: "#b7b7b7" }] : [])]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const donutTotal = donut.reduce((a, d) => a + d.value, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-auto rounded-[12px] border border-[var(--sheet-grid)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-card)]">
        <table className="border-separate border-spacing-0" role="grid" aria-label={`Expense tracker ${year}`}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 104 }} />
            {Array.from({ length: columnCount - 1 }, (_, i) => <col key={i} style={{ width: i >= columnCount - 1 - extra.length ? 132 : catWidth }} />)}
          </colgroup>
          <thead className="sticky top-0 z-[3]">
            <tr aria-hidden="true">
              <th className="sticky left-0 z-[2] h-[22px] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)]" />
              {Array.from({ length: columnCount }, (_, i) => (
                <th key={i} className={`h-[22px] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] font-normal ${active?.c === i ? "bg-[var(--sheet-select-soft)] font-semibold text-[var(--sheet-select)]" : "text-[var(--text-muted)]"} ${i === 0 ? "sticky left-[40px] z-[2]" : ""}`}>
                  {COL_LETTERS(i)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-[2] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-[11px] font-normal text-[var(--text-muted)]">1</th>
              <th className={`${cell} sticky left-[40px] z-[2] bg-[#f3f3f3] text-left font-bold text-[#111816]`}>Month</th>
              {cats.map((c, i) => (
                <th key={c.id} className={`${cell} text-left font-bold text-[#111816]`} style={{ background: PASTELS[i % PASTELS.length] }}>
                  <span className="block truncate">{c.name}</span>
                </th>
              ))}
              {showOther ? <th className={`${cell} bg-[#d9d9d9] text-left font-bold text-[#111816]`}>Uncategorised</th> : null}
              <th className={`${cell} border-l-2 border-l-[#666] bg-[#ea9999] text-left font-bold text-[#111816]`}>Total Expenditure</th>
              <th className={`${cell} bg-[#f9cb9c] text-left font-bold text-[#111816]`}>Income</th>
              <th className={`${cell} bg-[#b6d7a8] text-left font-bold text-[#111816]`}>Gross Savings</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => {
              const overall = budgetFor(row.month, null);
              return (
                <tr key={row.month}>
                  <td className={`sticky left-0 z-[1] border-b border-r border-[var(--sheet-grid)] text-center text-[11px] ${active?.r === r ? "bg-[var(--sheet-select-soft)] font-semibold text-[var(--sheet-select)]" : "bg-[var(--sheet-head)] text-[var(--text-muted)]"}`}>{r + 2}</td>
                  <td className={`${cell} sticky left-[40px] z-[1] bg-[var(--surface)] text-right`}><button type="button" onClick={() => onPickMonth(r)} title={`Open ${MONTHS[r]} in full`} className="font-medium text-[var(--accent)] underline-offset-2 hover:underline">{MONTHS[r]}</button></td>
                  {row.byCat.map((v, i) => {
                    const limit = budgetFor(row.month, cats[i].id);
                    const over = limit !== null && v > limit;
                    return (
                      <td key={i} onClick={select(r, i + 1)} className={`${cell} ${isActive(r, i + 1) ? ring : ""}`} style={over ? { background: OVER, color: "#111816" } : undefined} title={over ? `Over budget by ${formatMinorPlain(v - (limit ?? 0), currency)}` : undefined}>
                        <Money minor={v} currency={currency} />
                      </td>
                    );
                  })}
                  {showOther ? <td className={cell}><Money minor={row.uncategorised} currency={currency} /></td> : null}
                  <td className={`${cell} border-l-2 border-l-[#666]`} style={overall !== null && row.spent > overall ? { background: OVER, color: "#111816" } : undefined}>
                    <Money minor={row.spent} currency={currency} />
                  </td>
                  <td className={cell}><Money minor={row.income} currency={currency} /></td>
                  <td className={cell}><Money minor={row.savings} currency={currency} /></td>
                </tr>
              );
            })}
            {/* Spacer row, as in the template. */}
            <tr aria-hidden="true">
              <td className="sticky left-0 z-[1] h-[26px] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] text-[var(--text-muted)]">14</td>
              {Array.from({ length: columnCount }, (_, i) => <td key={i} className={`border-b border-r border-[var(--sheet-grid)] ${i === 0 ? "sticky left-[40px] z-[1] bg-[var(--surface)]" : ""}`} />)}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] text-[var(--text-muted)]">15</td>
              <td className={`${cell} sticky left-[40px] z-[1] bg-[#d9d9d9] font-bold text-[#111816]`}>Total</td>
              {colTotals.map((v, i) => <td key={i} className={`${cell} bg-[#f3f3f3] text-[#111816]`}><Money minor={v} currency={currency} bold /></td>)}
              {showOther ? <td className={`${cell} bg-[#f3f3f3] text-[#111816]`}><Money minor={otherTotal} currency={currency} bold /></td> : null}
              <td className={`${cell} border-l-2 border-l-[#666] bg-[#f3f3f3] text-[#111816]`}><Money minor={spentTotal} currency={currency} bold /></td>
              <td className={`${cell} bg-[#f3f3f3] text-[#111816]`}><Money minor={incomeTotal} currency={currency} bold /></td>
              <td className={`${cell} bg-[#f3f3f3] text-[#111816]`}><Money minor={incomeTotal - spentTotal} currency={currency} bold /></td>
            </tr>
            <tr aria-hidden="true">
              <td className="sticky left-0 z-[1] h-[26px] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] text-[var(--text-muted)]">16</td>
              {Array.from({ length: columnCount }, (_, i) => <td key={i} className={`border-b border-r border-[var(--sheet-grid)] ${i === 0 ? "sticky left-[40px] z-[1] bg-[var(--surface)]" : ""}`} />)}
            </tr>
            <tr>
              <td className="sticky left-0 z-[1] border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)] text-center text-[11px] text-[var(--text-muted)]">17</td>
              <td className={`${cell} sticky left-[40px] z-[1] bg-[#b6d7a8] font-bold text-[#111816]`}>Monthly Budget</td>
              {budgetRow.map((v, i) => <td key={i} className={`${cell} bg-[#d9ead3] text-[#111816]`}>{v === null ? <span className="block text-center text-[var(--text-faint)]">—</span> : <Money minor={v} currency={currency} />}</td>)}
              {showOther ? <td className={`${cell} bg-[#d9ead3] text-[#111816]`} /> : null}
              <td className={`${cell} border-l-2 border-l-[#666] bg-[#b6d7a8] text-[#111816]`}>{overallBudget === null ? null : <Money minor={overallBudget} currency={currency} bold />}</td>
              <td className={`${cell} bg-[#b6d7a8] text-[#111816]`} />
              <td className={`${cell} bg-[#b6d7a8] text-[#111816]`} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* The two embedded charts, drawn like Sheets charts: white box, thin grey border. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <figure className="rounded-[4px] border border-[var(--line-strong)] bg-[var(--surface)] p-5 text-[var(--text)]">
          <figcaption className="text-[16px]">Yearly Breakdown</figcaption>
          <div className="mt-4 flex flex-col gap-[7px]">
            {grid.map((row, r) => (
              <div key={row.month} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 text-[11px]">
                <span className="text-right">{MONTHS[r]}</span>
                <div className="flex items-center gap-2">
                  <div className="flex h-[11px] min-w-0" style={{ width: `${(row.spent / maxSpent) * 78}%` }}>
                    {row.byCat.map((v, i) => (v > 0 ? <span key={i} style={{ flexGrow: v, background: MARKS[i % MARKS.length] }} /> : null))}
                    {row.uncategorised > 0 ? <span style={{ flexGrow: row.uncategorised, background: "#b7b7b7" }} /> : null}
                  </div>
                  <span className="tnum shrink-0 whitespace-nowrap">{symbolOf(currency)} {row.spent ? formatMinorPlain(row.spent, currency) : "-"}</span>
                </div>
              </div>
            ))}
          </div>
        </figure>

        <figure className="rounded-[4px] border border-[var(--line-strong)] bg-[var(--surface)] p-5 text-[var(--text)]">
          <figcaption className="text-[16px]">Categories</figcaption>
          {donutTotal === 0 ? (
            <p className="mt-10 text-center text-[13px] text-[var(--text-muted)]">No spending recorded in {year} yet.</p>
          ) : (
            <div className="mt-4 grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <svg viewBox="0 0 42 42" className="mx-auto size-[190px] -rotate-90" role="img" aria-label="Spending by category">
                {(() => {
                  let offset = 0;
                  return donut.map((d) => {
                    const share = (d.value / donutTotal) * 100;
                    const el = (
                      <circle key={d.name} cx="21" cy="21" r="15.915" fill="none" stroke={d.colour} strokeWidth="7"
                        strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-offset} />
                    );
                    offset += share;
                    return el;
                  });
                })()}
              </svg>
              <ul className="flex flex-col gap-1.5 text-[11px]">
                {donut.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px]" style={{ background: d.colour }} />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="tnum text-[var(--text-muted)]">{((d.value / donutTotal) * 100).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </figure>
      </div>
    </div>
  );
}
