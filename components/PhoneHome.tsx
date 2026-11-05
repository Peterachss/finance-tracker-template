"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ChartLine, CircleDollarSign, Eye, EyeOff } from "lucide-react";
import { openQuickAdd } from "@/components/QuickAdd";
import { addDays, currentMonthKey, monthLabel, monthRange, todayIso } from "@/lib/dates";
import { categoryName, rangeTotals, recentTransactions } from "@/lib/finance";
import { formatMinor } from "@/lib/money";
import { useWorkspace } from "@/lib/store";
import type { Category, CurrencyCode, Transaction } from "@/lib/types";

/** Nixtio's "$ in a circle with a little arrow" glyph, drawn from Lucide parts. */
export function CoinArrow({ out, className = "size-6" }: { out: boolean; className?: string }) {
  return (
    <span className={`relative inline-block ${className}`} aria-hidden="true">
      <CircleDollarSign className="size-full" strokeWidth={1.5} />
      <svg viewBox="0 0 10 10" className="absolute -right-0.5 -top-0.5 size-[45%] rounded-full bg-[var(--surface)]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {out ? <path d="M3 7 7 3M4 3h3v3" /> : <path d="M7 3 3 7M3 4v3h3" />}
      </svg>
    </span>
  );
}

export function signedAmount(tx: Transaction, currency: CurrencyCode) {
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
  return `${sign}${formatMinor(tx.amount, currency, { symbol: true })}`;
}

/** Round logo: first letter of the description on a tinted disc. */
export function TxAvatar({ tx, size = 44 }: { tx: Transaction; size?: number }) {
  const letter = tx.type === "transfer" ? <ArrowLeftRight className="size-[45%]" strokeWidth={2} /> : (tx.description.trim()[0] ?? "•").toUpperCase();
  const tone =
    tx.type === "income"
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : tx.type === "transfer"
        ? "bg-[var(--lime)] text-[#111816]"
        : "bg-[var(--accent)] text-[var(--on-accent)]";
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-semibold ${tone}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {letter}
    </span>
  );
}

/** One transaction as a white rounded card, the reference's list row. */
export function TxCard({ tx, categories, currency, hidden = false }: {
  tx: Transaction;
  categories: Category[];
  currency: CurrencyCode;
  hidden?: boolean;
}) {
  const label = tx.type === "income" ? "Received" : tx.type === "transfer" ? "Moved" : "Paid";
  const category = tx.type === "transfer" ? null : categoryName(categories, tx.category_id);
  return (
    <div className="flex items-center gap-3 rounded-[22px] bg-[var(--surface)] px-4 py-3.5 shadow-[0_2px_8px_-4px_rgb(17_24_22/0.12)]">
      <TxAvatar tx={tx} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px]">{tx.description}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[13px] text-[var(--text-muted)]">
          <span className="truncate">{label}{category && category !== tx.description ? ` · ${category}` : ""}</span>
          <CoinArrow out={tx.type !== "income"} className="size-3.5 shrink-0" />
        </span>
      </span>
      <span
        className={`tnum shrink-0 text-[17px] ${
          tx.type === "income" ? "text-[var(--positive)]" : tx.type === "expense" ? "text-[var(--negative)]" : "text-[var(--text)]"
        }`}
      >
        {hidden ? "••••" : signedAmount(tx, currency)}
      </span>
    </div>
  );
}

export function dayHeading(date: string): string {
  const today = todayIso();
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", ...(String(y) === today.slice(0, 4) ? {} : { year: "numeric" }) })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * iPhone home, laid out exactly like the Nixtio home screen but in forest
 * green: balance card with Receive / Pay, the latest transaction
 * on a stack, then account tiles with a dark "Analytics" tile in the
 * "Add currency" slot. Logging and viewing only; analytics is one tap away.
 */
export function PhoneHome() {
  const { categories, transactions, currency } = useWorkspace();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem("ft-hide-balance") === "1") setHidden(true);
      } catch {
        // Storage blocked: start visible.
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const month = currentMonthKey();
  const totals = rangeTotals(transactions, monthRange(month));
  const latest = recentTransactions(transactions, 1)[0];
  const mask = (text: string) => (hidden ? "••••••" : text);

  return (
    <div className="flex flex-col gap-7 md:hidden">
      <section aria-label="Spent this month" className="rounded-[34px] bg-[var(--surface)] p-2 shadow-[0_24px_44px_-28px_rgb(17_24_22/0.45)]">
        <div className="relative rounded-[28px] bg-[var(--forest)] px-5 pb-7 pt-5 text-center text-white">
          <p className="text-[19px] font-semibold">Spent in {monthLabel(month)}</p>
          <p className="mt-1 text-[11px] text-white/70">{currency}</p>
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? "Show amount" : "Hide amount"}
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10"
          >
            {hidden ? <Eye className="size-5" strokeWidth={1.75} /> : <EyeOff className="size-5" strokeWidth={1.75} />}
          </button>
          <p className="tnum mt-4 text-[40px] font-bold leading-none tracking-[-0.035em]">
            {mask(formatMinor(totals.expense, currency, { symbol: true }))}
          </p>
        </div>
        <nav aria-label="Log money" className="grid grid-cols-2 divide-x divide-[var(--line)] py-4 text-[15px] text-[var(--text-muted)]">
          <button type="button" onClick={() => openQuickAdd("income")} className="flex flex-col items-center gap-2 py-1">
            <CoinArrow out={false} className="size-7 text-[var(--text)]" />
            Receive
          </button>
          <button type="button" onClick={() => openQuickAdd("expense")} className="flex flex-col items-center gap-2 py-1">
            <CoinArrow out className="size-7 text-[var(--text)]" />
            Pay
          </button>
        </nav>
      </section>

      <section aria-labelledby="latest">
        <div className="mb-3 flex items-center justify-between px-2">
          <h2 id="latest" className="text-[17px] font-medium">Latest Transactions</h2>
          <Link href="/activity" className="text-[15px] text-[var(--text-muted)]">See All</Link>
        </div>
        {latest ? (
          <Link href="/activity" className="relative block pb-3">
            {/* The stacked-cards look under the newest row. */}
            <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-10 rounded-[22px] bg-[var(--surface)]/50" />
            <span aria-hidden="true" className="absolute inset-x-1.5 bottom-1.5 h-10 rounded-[22px] bg-[var(--surface)]/75" />
            <span className="relative block"><TxCard tx={latest} categories={categories} currency={currency} hidden={hidden} /></span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openQuickAdd("expense")}
            className="flex w-full items-center gap-3 rounded-[22px] bg-[var(--surface)] px-4 py-4 text-left shadow-[0_2px_8px_-4px_rgb(17_24_22/0.12)]"
          >
            <span className="grid size-11 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><CoinArrow out className="size-6" /></span>
            <span>
              <span className="block text-[16px]">Nothing logged yet</span>
              <span className="block text-[13px] text-[var(--text-muted)]">Your first payment shows up here</span>
            </span>
          </button>
        )}
      </section>


      <section aria-labelledby="accounts-row">
        <h2 id="accounts-row" className="mb-3 px-2 text-[17px] font-medium">This month</h2>
        {/* One pot of money: Bank transfer and Cash are only how you paid, so no split balances here. */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="flex aspect-[0.78] flex-col justify-between rounded-[22px] bg-[var(--surface)] p-3.5">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--positive)]"><CoinArrow out={false} className="size-5" /></span>
            <span>
              <span className="block truncate text-[13px] text-[var(--text-muted)]">Received</span>
              <span className="tnum block truncate text-[17px]">{mask(formatMinor(totals.income, currency, { symbol: true, compact: true }))}</span>
            </span>
          </div>
          <div className="flex aspect-[0.78] flex-col justify-between rounded-[22px] bg-[var(--surface)] p-3.5">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-[var(--danger-soft)] text-[var(--negative)]"><CoinArrow out className="size-5" /></span>
            <span>
              <span className="block truncate text-[13px] text-[var(--text-muted)]">Spent</span>
              <span className="tnum block truncate text-[17px]">{mask(formatMinor(totals.expense, currency, { symbol: true, compact: true }))}</span>
            </span>
          </div>
          <Link
            href="/analytics"
            className="flex aspect-[0.78] flex-col items-center justify-center gap-2 rounded-[22px] bg-[var(--accent)] p-3 text-center text-[15px] leading-tight text-[var(--on-accent)]"
          >
            <ChartLine className="size-6" strokeWidth={1.5} />
            Open analytics
          </Link>
        </div>
      </section>
    </div>
  );
}
