"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { Banner, Skeleton } from "@/components/ui";
import { BalanceChart } from "@/components/BalanceChart";
import { InflowsOutflows } from "@/components/InflowsOutflows";
import { openQuickAdd } from "@/components/QuickAdd";
import { PhoneHome } from "@/components/PhoneHome";
import { ImportButton } from "@/components/ImportButton";
import {
  addDays,
  currentMonthKey,
  monthLabel,
  monthRange,
  shiftMonth,
  shortDayLabel,
  shortMonthLabel,
  todayIso,
} from "@/lib/dates";
import { downloadCsv, transactionsToCsv } from "@/lib/csv";
import {
  accountBalance,
  accountBalanceSeries,
  accountName,
  budgetProgress,
  categoryName,
  monthlyTrend,
  rangeTotals,
  recentTransactions,
  totalBalance,
  type BalancePeriod,
} from "@/lib/finance";
import { decimalStringToMinor, formatMinor } from "@/lib/money";
import { activeAccounts, useWorkspace } from "@/lib/store";
import type { Account, Category, CurrencyCode, Transaction } from "@/lib/types";

/**
 * Ranges the date-only transaction data can actually support. There is no
 * hourly option: `tx_date` is a date, so intraday figures do not exist.
 */
const RANGES = [
  { id: "month", label: "Month", days: 0 },
  { id: "12m", label: "12 months", days: 0 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "7d", label: "7 days", days: 7 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const KIND_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", savings: "Savings", ewallet: "E-wallet" };
const KIND_CHIP: Record<string, string> = { cash: "CASH", bank: "BANK", savings: "SAVE", ewallet: "WALLET" };

const card = "rounded-[16px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]";

/* ------------------------------------------------------------ small parts */

/** QClay-style mini bar sparkline: the last bar is the current month. */
function MiniBars({ values }: { values: number[] }) {
  // Nothing recorded yet: draw nothing rather than a row of placeholder ticks.
  if (values.every((v) => v === 0)) return null;
  const max = Math.max(1, ...values.map(Math.abs));
  return (
    <span aria-hidden="true" className="flex h-9 items-end gap-[5px]">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${Math.max(12, (Math.abs(v) / max) * 100)}%`,
            background: i === values.length - 1 ? "var(--text)" : "var(--line-strong)",
          }}
        />
      ))}
    </span>
  );
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  if (before === 0) return null;
  const pct = ((now - before) / Math.abs(before)) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[12px] font-medium ${good ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
      <span className="tnum">{Math.abs(pct).toFixed(1)}%</span>
      <span className="ml-1 font-normal text-[var(--text-faint)]">vs last month</span>
    </span>
  );
}

/** Category monogram: dark for spending, mint for income, like the Nixtio logos. */
function Monogram({ tx, categories, size = 40 }: { tx: Transaction; categories: Category[]; size?: number }) {
  const income = tx.type === "income";
  const letter =
    tx.type === "transfer" ? <ArrowLeftRight className="size-[45%]" strokeWidth={2} /> : (tx.description.trim()[0] ?? categoryName(categories, tx.category_id)[0] ?? "•").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${
        income ? "bg-[var(--accent-soft)] text-[var(--positive)]" : tx.type === "transfer" ? "bg-[var(--lime)] text-[#111816]" : "bg-[var(--text)] text-[var(--surface)]"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {letter}
    </span>
  );
}

function signedAmount(tx: Transaction, currency: CurrencyCode, symbol = true) {
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
  return `${sign}${formatMinor(tx.amount, currency, { symbol })}`;
}

/* -------------------------------------------------------- quick money in */

/**
 * The QClay "Send money" block, repurposed: pick an account, type an amount,
 * press Add. One field and one button is the fastest path to a saved record.
 */
function QuickMoney({ accounts }: { accounts: Account[] }) {
  const { commitBatch } = useWorkspace();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Always starts on Bank transfer (bank accounts are listed first).
  const account = accountId || accounts[0]?.id || "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let minor = 0;
    try {
      minor = decimalStringToMinor(amount.replace(/[,\s]/g, ""));
    } catch {
      minor = 0;
    }
    if (!account || minor <= 0) return setStatus("error");
    setStatus("saving");
    try {
      await commitBatch(
        [{
          date: todayIso(),
          description: kind === "income" ? "Money in" : "Money out",
          type: kind,
          category_id: null,
          account_id: account,
          to_account_id: null,
          amount: minor,
          notes: "",
        }],
        [],
      );
      setAmount("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
    }
  };

  return (
    <section aria-labelledby="quick-money">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="quick-money" className="text-[15px] font-semibold">Add money</h2>
        <div role="group" aria-label="Type" className="flex rounded-full bg-[var(--surface-sunken)] p-0.5 text-[12px] font-medium">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full px-3 py-1 transition-colors ${kind === k ? "bg-[var(--surface)] shadow-[0_1px_2px_rgb(17_24_22/0.1)]" : "text-[var(--text-muted)]"}`}
            >
              {k === "expense" ? "Spent" : "Received"}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts as the round avatars of the reference. */}
      <div className="mb-4 flex items-center gap-2.5" role="radiogroup" aria-label="Account">
        <Link
          href="/settings"
          aria-label="Add account"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-dashed border-[var(--line-strong)] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <Plus className="size-4" strokeWidth={2} />
        </Link>
        {accounts.slice(0, 5).map((a) => {
          const selected = a.id === account;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={a.name}
              title={a.name}
              onClick={() => setAccountId(a.id)}
              className={`grid size-11 shrink-0 place-items-center rounded-full text-[14px] font-semibold transition-shadow ${
                selected
                  ? "bg-[var(--lime)] text-[#111816] ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--surface)]"
                  : "bg-[var(--accent-soft)] text-[var(--text)]"
              }`}
            >
              {a.name.slice(0, 2)}
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="quick-amount" className="sr-only">Amount</label>
        <input
          id="quick-amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setStatus("idle"); }}
          placeholder="Amount…"
          className="tnum h-11 min-w-0 flex-1 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[14px] placeholder:text-[var(--text-faint)]"
        />
        <button
          type="submit"
          disabled={status === "saving"}
          className="h-11 rounded-[10px] bg-[var(--accent)] px-5 text-[14px] font-medium text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Add"}
        </button>
      </form>
      <p className="mt-2 min-h-4 text-[12px]" aria-live="polite">
        {status === "saved" ? (
          <span className="text-[var(--positive)]">Saved to {accountName(accounts, account)}.</span>
        ) : status === "error" ? (
          <span className="text-[var(--negative)]">Enter an amount above zero{accounts.length ? "" : " and add an account first"}.</span>
        ) : (
          <button type="button" onClick={() => openQuickAdd(kind)} className="text-[var(--text-muted)] underline-offset-2 hover:underline">
            Add category and note with the keypad
          </button>
        )}
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- desktop */

/** Website pages, shown as chips when the analytics view is opened on a phone. */
const SITE_PAGES = [
  { href: "/spreadsheet", label: "Sheet" },
  { href: "/allowance", label: "Allowance" },
  { href: "/bills", label: "Bills" },
  { href: "/goals", label: "Dream list" },
  { href: "/budgets", label: "Budgets" },
  { href: "/settings", label: "Settings" },
];

/**
 * `home` (the / route): the iPhone sees only the logging home; laptops see
 * the full dashboard. `analytics` (/analytics): the full dashboard on every
 * screen, which is what the phone's analytics button opens.
 */
export function Dashboard({ view = "home" }: { view?: "home" | "analytics" }) {
  const { transactions, accounts, categories, budgets, currency, state, error, setupRequired } = useWorkspace();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [range, setRange] = useState<RangeId>("month");
  const [query, setQuery] = useState("");
  const [exported, setExported] = useState(false);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = todayIso();

  const periods = useMemo<BalancePeriod[]>(() => {
    if (range === "month") {
      // Each day of the selected month, up to today when it is the current month.
      const { start, end } = monthRange(month);
      const last = end <= today ? end : addDays(today, 1);
      const count = Math.max(1, Math.round((Date.parse(last) - Date.parse(start)) / 86_400_000));
      return Array.from({ length: count }, (_, i) => {
        const date = addDays(start, i);
        return { key: shortDayLabel(date), end: addDays(date, 1) };
      });
    }
    if (range === "12m") {
      return Array.from({ length: 12 }, (_, i) => {
        const key = shiftMonth(month, i - 11);
        return { key: shortMonthLabel(key), end: monthRange(key).end };
      });
    }
    const days = RANGES.find((r) => r.id === range)?.days ?? 30;
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(today, i - days + 1);
      return { key: shortDayLabel(date), end: addDays(date, 1) };
    });
  }, [range, month, today]);

  const series = useMemo(() => accountBalanceSeries(accounts, transactions, periods), [accounts, transactions, periods]);
  const plotted = useMemo(() => accounts.filter((a) => !a.archived).slice(0, 2), [accounts]);
  const chartData = useMemo(
    () =>
      series.map((point) => {
        const row: Record<string, string | number> = { label: point.period };
        plotted.forEach((account, slot) => {
          row[`s${slot}`] = point.values[account.id] ?? 0;
        });
        return row;
      }),
    [series, plotted],
  );

  const trend = useMemo(
    () => monthlyTrend(transactions, Array.from({ length: 8 }, (_, i) => shiftMonth(month, i - 7))),
    [transactions, month],
  );
  const thisMonth = trend[trend.length - 1] ?? { income: 0, expense: 0, net: 0 };
  const lastMonth = trend[trend.length - 2] ?? { income: 0, expense: 0, net: 0 };
  const balance = useMemo(() => totalBalance(accounts, transactions), [accounts, transactions]);
  const balanceTrend = useMemo(() => {
    // Total balance at each of the 8 month-ends, walked back from today.
    const start = balance - trend.reduce((sum, p) => sum + p.net, 0);
    return trend.map((_, i) => start + trend.slice(0, i + 1).reduce((sum, p) => sum + p.net, 0));
  }, [balance, trend]);

  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? transactions.filter((tx) =>
          [tx.description, tx.notes, tx.date, categoryName(categories, tx.category_id)].join(" ").toLowerCase().includes(needle),
        )
      : transactions;
    return recentTransactions(base, 12);
  }, [query, transactions, categories]);

  const live = useMemo(() => activeAccounts(accounts), [accounts]);
  const primary = live[0] ?? null;
  const primaryMonth = useMemo(
    () => (primary ? rangeTotals(transactions.filter((t) => t.account_id === primary.id), monthRange(month)) : null),
    [primary, transactions, month],
  );
  const budgetRows = useMemo(() => budgetProgress(budgets, transactions, month), [budgets, transactions, month]);

  const exportReport = () => {
    downloadCsv(`transactions-${today}.csv`, transactionsToCsv(transactions, categories, accounts));
    setExported(true);
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => setExported(false), 2000);
  };

  if (setupRequired) return <Banner tone="error" title="Not configured:">{error}</Banner>;
  if (state === "error") return <Banner tone="error" title="Could not load:">{error}</Banner>;
  if (state === "loading") {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const kpis = [
    { label: "Total balance", value: balance, values: balanceTrend, delta: <Delta now={balanceTrend.at(-1) ?? 0} before={balanceTrend.at(-2) ?? 0} />, signed: false },
    { label: `Income · ${shortMonthLabel(month)}`, value: thisMonth.income, values: trend.map((p) => p.income), delta: <Delta now={thisMonth.income} before={lastMonth.income} />, signed: false },
    { label: `Spent · ${shortMonthLabel(month)}`, value: thisMonth.expense, values: trend.map((p) => p.expense), delta: <Delta now={thisMonth.expense} before={lastMonth.expense} invert />, signed: false },
    { label: `Net · ${shortMonthLabel(month)}`, value: thisMonth.net, values: trend.map((p) => p.net), delta: <Delta now={thisMonth.net} before={lastMonth.net} />, signed: true },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      {view === "home" ? <PhoneHome /> : null}

      <div className={`${view === "analytics" ? "flex" : "hidden"} flex-col gap-8 md:flex`}>
        {view === "analytics" ? (
          <nav aria-label="Website pages" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:hidden">
            <Link href="/" className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] px-4 text-[14px] font-medium text-[var(--on-accent)]">
              <ChevronLeft className="size-4" strokeWidth={2} />
              Home
            </Link>
            {SITE_PAGES.map((page) => (
              <Link key={page.href} href={page.href} className="inline-flex h-10 shrink-0 items-center rounded-full bg-[var(--surface)] px-4 text-[14px] font-medium">
                {page.label}
              </Link>
            ))}
          </nav>
        ) : null}
        {/* Heading left; search, month and the primary action right. */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.025em]">My accounts</h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-md:hidden">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[var(--text-faint)]" strokeWidth={1.75} />
              <label htmlFor="dash-search" className="sr-only">Search transactions</label>
              <input
                id="dash-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-11 w-56 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] pl-10 pr-3 text-[15px] shadow-[var(--shadow-card)] placeholder:text-[var(--text-faint)] lg:w-72"
              />
            </div>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              aria-label="Select month"
              className="h-11 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] shadow-[var(--shadow-card)]"
            >
              {Array.from({ length: 18 }, (_, i) => shiftMonth(currentMonthKey(), -i)).map((v) => (
                <option key={v} value={v}>{monthLabel(v)}</option>
              ))}
            </select>
            <ImportButton className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[15px] font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--surface-sunken)]" />
            <button
              onClick={exportReport}
              className="h-11 rounded-[10px] bg-[var(--accent)] px-4 text-[15px] font-medium text-[var(--on-accent)] shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--accent-hover)]"
            >
              <span aria-live="polite">{exported ? "Exported" : "Export report"}</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* KPI strip (QClay): uppercase label, figure, change, mini bars. */}
            <section aria-label="Summary" className={`${card} grid grid-cols-2 lg:grid-cols-4`}>
              {kpis.map((k, i) => (
                <div
                  key={k.label}
                  className={`flex min-w-0 flex-col gap-2 p-5 ${i % 2 === 1 ? "border-l border-[var(--line)]" : ""} ${i >= 2 ? "border-t border-[var(--line)] lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
                >
                  <p className="label">{k.label}</p>
                  <div className="flex items-end justify-between gap-3">
                    <p className="tnum truncate text-[22px] font-semibold leading-none tracking-[-0.02em]">
                      {formatMinor(k.value, currency, { symbol: true, signed: k.signed })}
                    </p>
                    <MiniBars values={k.values} />
                  </div>
                  {k.delta}
                </div>
              ))}
            </section>

            {/* Balance over time (Untitled UI). */}
            <section className={`${card} p-6`} aria-labelledby="bal-heading">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 id="bal-heading" className="text-[18px] font-semibold tracking-[-0.01em]">Balance over time</h2>
                <div role="group" aria-label="Chart range" className="flex items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-sunken)] p-1">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRange(r.id)}
                      aria-pressed={range === r.id}
                      className={`whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        range === r.id
                          ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_rgb(17_24_22/0.1)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text)]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <BalanceChart data={chartData} accounts={plotted} currency={currency} />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/spreadsheet"
                  className="inline-flex h-10 items-center rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[14px] font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  View full report
                </Link>
                {plotted.length < live.length ? (
                  <p className="text-[12px] text-[var(--text-faint)]">Showing {plotted.map((a) => a.name).join(" and ")}</p>
                ) : null}
              </div>
            </section>

            <InflowsOutflows transactions={transactions} month={month} currency={currency} />

            {/* Transactions (Untitled UI table). */}
            <section className={`${card} p-6 max-md:hidden`} aria-labelledby="tx-heading">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="tx-heading" className="text-[18px] font-semibold tracking-[-0.01em]">Transactions</h2>
                <Link
                  href="/spreadsheet"
                  aria-label="Open the transactions grid"
                  className="grid size-9 place-items-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                >
                  <Ellipsis className="size-5 rotate-90" strokeWidth={2} />
                </Link>
              </div>
              <div className="relative mb-2">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[var(--text-faint)]" strokeWidth={1.75} />
                <label htmlFor="tx-search" className="sr-only">Search transactions</label>
                <input
                  id="tx-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search transactions"
                  className="h-11 w-full rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] pl-10 pr-3 text-[15px] placeholder:text-[var(--text-faint)]"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <caption className="sr-only">Saved transactions, most recent first</caption>
                  <thead>
                    <tr className="border-b border-[var(--line)] text-left text-[12px] text-[var(--text-muted)]">
                      <th scope="col" className="py-3 pr-4 font-medium">Merchant</th>
                      <th scope="col" className="py-3 pr-6 text-right font-medium">Amount</th>
                      <th scope="col" className="py-3 pr-4 font-medium">Account</th>
                      <th scope="col" className="w-10 py-3"><span className="sr-only">Edit</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {searched.map((tx) => {
                      const acct = accounts.find((a) => a.id === tx.account_id);
                      return (
                        <tr key={tx.id}>
                          <td className="py-3.5 pr-4">
                            <span className="flex items-center gap-3">
                              <Monogram tx={tx} categories={categories} />
                              <span className="min-w-0">
                                <span className="block max-w-[32ch] truncate font-medium">{tx.description}</span>
                                <span className="block truncate text-[12px] text-[var(--text-faint)]">
                                  {tx.type === "transfer" ? "Transfer" : categoryName(categories, tx.category_id) || "Uncategorised"} · {shortDayLabel(tx.date)}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className={`tnum whitespace-nowrap py-3.5 pr-6 text-right font-medium ${tx.type === "income" ? "text-[var(--positive)]" : ""}`}>
                            {signedAmount(tx, currency)}
                          </td>
                          <td className="py-3.5 pr-4">
                            <span className="flex items-center gap-3">
                              <span aria-hidden="true" className="grid h-8 w-12 shrink-0 place-items-center rounded-[6px] border border-[var(--line)] text-[9px] font-bold tracking-wide text-[var(--text-muted)]">
                                {KIND_CHIP[acct?.kind ?? "bank"]}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{accountName(accounts, tx.account_id)}</span>
                                <span className="block truncate text-[12px] text-[var(--text-faint)]">
                                  {tx.type === "transfer" && tx.to_account_id ? `to ${accountName(accounts, tx.to_account_id)}` : KIND_LABEL[acct?.kind ?? ""] ?? ""}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="py-3.5 text-right">
                            <Link
                              href={`/spreadsheet?q=${encodeURIComponent(tx.description)}`}
                              aria-label={`Edit ${tx.description}`}
                              className="inline-grid size-9 place-items-center rounded-[8px] text-[var(--text-faint)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                            >
                              <Pencil className="size-4" strokeWidth={1.75} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                    {searched.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-[var(--text-muted)]">No transactions match “{query}”.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <Link href="/spreadsheet" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
                All transactions <ChevronRight className="size-4" strokeWidth={1.75} />
              </Link>
            </section>
          </div>

          {/* Right rail (QClay): add money, total balance, account card, limits. */}
          <aside aria-label="Accounts and budgets" className={`${card} flex min-w-0 flex-col divide-y divide-[var(--line)] self-start`}>
            <div className="p-6 max-md:hidden">
              <QuickMoney accounts={live} />
            </div>

            <section className="p-6" aria-labelledby="total-heading">
              <h2 id="total-heading" className="text-[15px] font-semibold">Total balance</h2>
              <p className="tnum mt-3 text-[30px] font-semibold leading-none tracking-[-0.025em]">
                {formatMinor(balance, currency, { symbol: true })}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
                <div>
                  <dt className="text-[var(--text-muted)]">Income</dt>
                  <dd className="tnum mt-1 text-[15px] font-medium">{formatMinor(thisMonth.income, currency, { symbol: true })}</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">Expenses</dt>
                  <dd className="tnum mt-1 text-[15px] font-medium">{formatMinor(thisMonth.expense, currency, { symbol: true })}</dd>
                </div>
              </dl>

              {primary && primaryMonth ? (
                <Link href="/settings" className="mt-5 block rounded-[14px] border border-[var(--line)] p-4 transition-colors hover:bg-[var(--surface-sunken)]">
                  <span className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid size-10 place-items-center rounded-[10px] border border-dashed border-[var(--line-strong)] text-[13px] font-semibold">
                      {primary.name.slice(0, 2)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{primary.name}</span>
                      <span className="block text-[12px] text-[var(--text-faint)]">{KIND_LABEL[primary.kind]} · {primary.currency}</span>
                    </span>
                    <ChevronRight className="size-4 text-[var(--text-faint)]" strokeWidth={1.75} />
                  </span>
                  <span className="tnum mt-4 block text-[22px] font-semibold tracking-[-0.02em]">
                    {formatMinor(accountBalance(primary, transactions), currency, { symbol: true })}
                  </span>
                  <span className="tnum mt-3 flex gap-4 text-[12px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1"><ArrowDownLeft className="size-3.5 text-[var(--positive)]" strokeWidth={2.25} />{formatMinor(primaryMonth.income, currency, { symbol: true, compact: true })} in</span>
                    <span className="inline-flex items-center gap-1"><ArrowUpRight className="size-3.5 text-[var(--negative)]" strokeWidth={2.25} />{formatMinor(primaryMonth.expense, currency, { symbol: true, compact: true })} out</span>
                  </span>
                </Link>
              ) : null}
            </section>

            <section className="p-6" aria-labelledby="accts-heading">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="accts-heading" className="text-[15px] font-semibold">Accounts</h2>
                <Link className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]" href="/settings">Manage</Link>
              </div>
              <ul className="flex flex-col">
                {live.map((account) => (
                  <li key={account.id} className="flex items-center gap-3 py-2.5">
                    <span aria-hidden="true" className="grid h-8 w-11 shrink-0 place-items-center rounded-[6px] border border-[var(--line)] text-[9px] font-bold tracking-wide text-[var(--text-muted)]">
                      {KIND_CHIP[account.kind]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{account.name}</span>
                    <span className="tnum text-[14px] font-medium">{formatMinor(accountBalance(account, transactions), currency, { symbol: true })}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="p-6" aria-labelledby="limit-heading">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="limit-heading" className="text-[17px] font-semibold tracking-[-0.01em]">Limit tracker</h2>
                <Link className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]" href="/budgets">
                  {budgetRows.length === 0 ? "Set a limit" : "Manage"}
                </Link>
              </div>
              {budgetRows.length === 0 ? (
                <p className="text-[13px] text-[var(--text-muted)]">No limits for {monthLabel(month)}. Set one in Budgets to track spending here.</p>
              ) : (
                <ul className="flex flex-col gap-5">
                  {budgetRows.slice(0, 5).map((row) => {
                    const label = row.budget.category_id === null ? "Monthly limit" : categoryName(categories, row.budget.category_id);
                    const colour = row.level === "over" ? "var(--negative)" : row.level === "warning" ? "var(--warning)" : "var(--series-1)";
                    return (
                      <li key={row.budget.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[14px] text-[var(--text-muted)]">{label}</span>
                          <span className="tnum text-[18px] font-semibold tracking-[-0.01em]">{formatMinor(row.budget.amount, currency, { symbol: true })}</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label={`${label} used`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.min(100, Math.round(row.percentUsed))}
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                        >
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.percentUsed)}%`, background: colour }} />
                        </div>
                        <p className="tnum mt-1.5 text-[12px] text-[var(--text-faint)]">
                          {formatMinor(row.spent, currency, { symbol: true })} spent ·{" "}
                          {row.remaining >= 0
                            ? `${formatMinor(row.remaining, currency, { symbol: true })} left`
                            : `${formatMinor(-row.remaining, currency, { symbol: true })} over`}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
