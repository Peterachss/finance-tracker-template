"use client";

import { useMemo } from "react";
import { BUCKET_SPEC, useCollection, type Bucket } from "@/lib/collections";
import { monthLabel, monthRange, shortDayLabel } from "@/lib/dates";
import { accountName, categoryName } from "@/lib/finance";
import { formatMinorPlain } from "@/lib/money";
import { activeCategories, useWorkspace } from "@/lib/store";
import {
  MARKS,
  PASTELS,
  SheetFrame,
  SheetMoney,
  currencySymbol,
  sheetCell,
  sheetHeadGreen,
  sheetLetter,
  sheetNum,
  sheetTotal,
} from "@/components/sheet";

/** Number of days in a `YYYY-MM` month. */
function daysIn(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

/** Time the entry was logged, in the device's time zone (e.g. 13:42). */
function loggedAt(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * One month in full: every payment as its own row (date and time, what it
 * was, category, account, amount), then totals, then the month's daily
 * breakdown and category charts.
 */
export function MonthDetail({ month }: { month: string }) {
  const { transactions, categories, accounts, budgets, currency } = useWorkspace();
  const jars = useCollection<Bucket>({ ...BUCKET_SPEC });

  const cats = useMemo(() => activeCategories(categories).filter((c) => c.kind === "expense"), [categories]);
  const { start, end } = monthRange(month);
  const days = daysIn(month);

  const entries = useMemo(
    () =>
      transactions
        .filter((t) => t.date >= start && t.date < end)
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    [transactions, start, end],
  );

  const grid = useMemo(() => {
    return Array.from({ length: days }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      const onDay = entries.filter((t) => t.date === date);
      const byCat = cats.map((c) => onDay.filter((t) => t.type === "expense" && t.category_id === c.id).reduce((a, t) => a + t.amount, 0));
      const other = onDay.filter((t) => t.type === "expense" && !cats.some((c) => c.id === t.category_id)).reduce((a, t) => a + t.amount, 0);
      return { date, byCat, other, spent: byCat.reduce((a, b) => a + b, 0) + other };
    });
  }, [entries, cats, month, days]);

  const colTotals = cats.map((_, i) => grid.reduce((a, r) => a + r.byCat[i], 0));
  const otherTotal = grid.reduce((a, r) => a + r.other, 0);
  const spentTotal = grid.reduce((a, r) => a + r.spent, 0);
  const incomeTotal = entries.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const overall =
    budgets.find((b) => b.month === month && b.category_id === null)?.amount ??
    (jars.rows.filter((j) => !j.is_saving).reduce((a, j) => a + j.amount, 0) || null);

  const maxDay = Math.max(1, ...grid.map((r) => r.spent));
  const showOther = otherTotal > 0;
  const donut = [...cats.map((c, i) => ({ name: c.name, value: colTotals[i], colour: MARKS[i % MARKS.length] })), ...(showOther ? [{ name: "Uncategorised", value: otherTotal, colour: "#b7b7b7" }] : [])]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const donutTotal = donut.reduce((a, d) => a + d.value, 0);
  const chipFor = (categoryId: string | null) => {
    const i = cats.findIndex((c) => c.id === categoryId);
    return i >= 0 ? PASTELS[i % PASTELS.length] : "#d9d9d9";
  };

  return (
    <div className="flex flex-col gap-5">
      <SheetFrame label={`Payments in ${monthLabel(month)}`}>
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 150 }} />
          <col />
          <col style={{ width: 170 }} />
          <col style={{ width: 140 }} />
          <col style={{ width: 160 }} />
        </colgroup>
        <thead>
          <tr aria-hidden="true">
            <th className={sheetLetter} />
            {["A", "B", "C", "D", "E"].map((l) => <th key={l} className={sheetLetter}>{l}</th>)}
          </tr>
          <tr>
            <th className={sheetNum}>1</th>
            <th className={sheetHeadGreen}>Date</th>
            <th className={sheetHeadGreen}>What for</th>
            <th className={sheetHeadGreen}>Category</th>
            <th className={sheetHeadGreen}>Account</th>
            <th className={`${sheetHeadGreen} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td className={sheetNum}>2</td>
              <td colSpan={5} className={`${sheetCell} text-[var(--text-muted)]`}>No payments in {monthLabel(month)} yet.</td>
            </tr>
          ) : null}
          {entries.map((t, i) => (
            <tr key={t.id}>
              <td className={sheetNum}>{i + 2}</td>
              <td className={sheetCell}>
                {shortDayLabel(t.date)} <span className="tnum text-[var(--text-faint)]">· {loggedAt(t.created_at)}</span>
              </td>
              <td className={`${sheetCell} max-w-0 truncate`}>{t.description}</td>
              <td className={sheetCell}>
                {t.type === "expense" ? (
                  <span className="inline-block max-w-full truncate rounded-[4px] px-1.5 leading-[20px] text-[12px] font-medium text-[#111816]" style={{ background: chipFor(t.category_id) }}>
                    {categoryName(categories, t.category_id) || "Uncategorised"}
                  </span>
                ) : (
                  <span className="text-[12px] text-[var(--text-muted)]">{t.type === "income" ? categoryName(categories, t.category_id) || "Income" : "Transfer"}</span>
                )}
              </td>
              <td className={`${sheetCell} text-[var(--text-muted)]`}>{accountName(accounts, t.account_id)}</td>
              <td className={`${sheetCell} ${t.type === "income" ? "text-[var(--positive)]" : ""}`}>
                <SheetMoney minor={t.amount} currency={currency} />
              </td>
            </tr>
          ))}
          <tr>
            <td className={sheetNum}>{entries.length + 2}</td>
            <td colSpan={4} className={sheetTotal}>Total spent</td>
            <td className={sheetTotal}><SheetMoney minor={spentTotal} currency={currency} bold /></td>
          </tr>
          <tr>
            <td className={sheetNum}>{entries.length + 3}</td>
            <td colSpan={4} className={sheetTotal}>Income</td>
            <td className={sheetTotal}><SheetMoney minor={incomeTotal} currency={currency} bold /></td>
          </tr>
          {overall !== null ? (
            <tr>
              <td className={sheetNum}>{entries.length + 4}</td>
              <td colSpan={4} className={sheetTotal}>Left of this month&apos;s budget</td>
              <td className={sheetTotal} style={spentTotal > overall ? { background: "#e6a5a5", color: "#111816" } : undefined}>
                <SheetMoney minor={overall - spentTotal} currency={currency} bold />
              </td>
            </tr>
          ) : null}
        </tbody>
      </SheetFrame>

      <div className="grid gap-5 lg:grid-cols-2">
        <figure className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <figcaption className="text-[16px] font-medium">Daily breakdown</figcaption>
          {spentTotal === 0 ? (
            <p className="mt-10 text-center text-[13px] text-[var(--text-muted)]">No spending in {monthLabel(month)} yet.</p>
          ) : (
            <>
              <div className="mt-4 flex h-[180px] items-end gap-[3px]">
                {grid.map((row) => (
                  <div key={row.date} className="flex h-full flex-1 flex-col justify-end" title={`${row.date}: ${currencySymbol(currency)} ${formatMinorPlain(row.spent, currency)}`}>
                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-[2px]" style={{ height: `${(row.spent / maxDay) * 100}%` }}>
                      {row.byCat.map((v, i) => (v > 0 ? <span key={i} style={{ flexGrow: v, background: MARKS[i % MARKS.length] }} /> : null))}
                      {row.other > 0 ? <span style={{ flexGrow: row.other, background: "#b7b7b7" }} /> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[var(--text-faint)]"><span>1</span><span>{Math.ceil(days / 2)}</span><span>{days}</span></div>
            </>
          )}
        </figure>

        <figure className="rounded-[12px] border border-[var(--line)] bg-[var(--surface)] p-5">
          <figcaption className="text-[16px] font-medium">Categories</figcaption>
          {donutTotal === 0 ? (
            <p className="mt-10 text-center text-[13px] text-[var(--text-muted)]">No spending in {monthLabel(month)} yet.</p>
          ) : (
            <div className="mt-4 grid items-center gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <svg viewBox="0 0 42 42" className="mx-auto size-[170px] -rotate-90" role="img" aria-label="Spending by category">
                {(() => {
                  let offset = 0;
                  return donut.map((d) => {
                    const share = (d.value / donutTotal) * 100;
                    const el = <circle key={d.name} cx="21" cy="21" r="15.915" fill="none" stroke={d.colour} strokeWidth="7" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-offset} />;
                    offset += share;
                    return el;
                  });
                })()}
              </svg>
              <ul className="flex flex-col gap-1.5 text-[12px]">
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
