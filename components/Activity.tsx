"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, Search, Trash2, X } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { TxCard, dayHeading } from "@/components/PhoneHome";
import { openQuickAdd } from "@/components/QuickAdd";
import { accountName, categoryName, rangeTotals, recentTransactions } from "@/lib/finance";
import { currentMonthKey, monthLabel, monthRange, shiftMonth } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { activeAccounts, activeCategories, useWorkspace } from "@/lib/store";
import type { Transaction } from "@/lib/types";

/**
 * Every transaction, newest first, grouped Today / Yesterday / date — the
 * Nixtio "Transactions" screen in forest green. Tap a row to see its details
 * or delete a mistake. Works the same on a laptop, in a narrow column.
 */
export function Activity() {
  const { transactions, accounts, categories, currency, state, removeTransactions, commitBatch } = useWorkspace();
  const [saving, setSaving] = useState<string | null>(null);

  /** Re-file an entry under another category without logging it again. */
  const changeCategory = async (tx: Transaction, categoryId: string | null) => {
    if (tx.category_id === categoryId || tx.id.startsWith("local-")) return;
    setSaving(tx.id);
    setError(null);
    try {
      await commitBatch([], [{
        id: tx.id, version: tx.version, date: tx.date, description: tx.description, type: tx.type,
        category_id: categoryId, account_id: tx.account_id, to_account_id: tx.to_account_id, amount: tx.amount, notes: tx.notes,
      }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };
  const [accountId, setAccountId] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One month at a time keeps the list short; "Show earlier" adds the month before.
  const [monthsShown, setMonthsShown] = useState(1);
  const thisMonth = currentMonthKey();
  const oldestShown = shiftMonth(thisMonth, -(monthsShown - 1));
  const cutoff = monthRange(oldestShown).start;

  const days = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = recentTransactions(transactions, transactions.length).filter(
      (t) =>
        (!accountId || t.account_id === accountId || t.to_account_id === accountId) &&
        (!needle || `${t.description} ${t.notes} ${categoryName(categories, t.category_id)}`.toLowerCase().includes(needle)) &&
        (needle !== "" || t.date >= cutoff),
    );
    return list.reduce<{ date: string; rows: Transaction[] }[]>((groups, tx) => {
      const last = groups[groups.length - 1];
      if (last && last.date === tx.date) last.rows.push(tx);
      else groups.push({ date: tx.date, rows: [tx] });
      return groups;
    }, []);
  }, [transactions, accountId, query, categories, cutoff]);
  const hasOlder = !query.trim() && transactions.some((t) => t.date < cutoff);
  const shownMonths = Array.from({ length: monthsShown }, (_, i) => shiftMonth(thisMonth, -i));

  const remove = async (tx: Transaction) => {
    if (!confirm(`Delete "${tx.description}"?`)) return;
    try {
      await removeTransactions([tx.id]);
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-5">
      <header className="flex h-12 items-center justify-between">
        <Link href="/" aria-label="Back to home" className="grid size-10 place-items-center rounded-full hover:bg-black/5">
          <ChevronLeft className="size-6" strokeWidth={1.75} />
        </Link>
        <h1 className="text-[18px] font-medium">Transactions</h1>
        <button
          type="button"
          aria-label={searching ? "Close search" : "Search"}
          onClick={() => { setSearching((s) => !s); setQuery(""); }}
          className="grid size-10 place-items-center rounded-full hover:bg-black/5"
        >
          {searching ? <X className="size-5" strokeWidth={1.75} /> : <Search className="size-5" strokeWidth={1.75} />}
        </button>
      </header>

      {searching ? (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, note or category"
          aria-label="Search transactions"
          className="h-12 rounded-full bg-[var(--surface)] px-5 text-[15px] shadow-[0_2px_8px_-4px_rgb(17_24_22/0.12)] outline-none placeholder:text-[var(--text-faint)]"
        />
      ) : null}

      {/* Account filter in the reference's dark card pill, here forest. */}
      <div className="relative mx-auto">
        <label htmlFor="act-account" className="sr-only">Account</label>
        <select
          id="act-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="h-10 appearance-none rounded-full bg-[var(--accent)] pl-4 pr-9 text-[14px] font-medium text-[var(--on-accent)]"
        >
          <option value="">All accounts</option>
          {activeAccounts(accounts).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--on-accent)]" strokeWidth={2} />
      </div>

      {error ? <p role="alert" className="text-center text-[13px] text-[var(--negative)]">{error}</p> : null}

      {state === "loading" ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-[72px] w-full rounded-[22px]" />
          <Skeleton className="h-[72px] w-full rounded-[22px]" />
        </div>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-[16px]">{query || accountId ? "Nothing matches" : hasOlder ? "Nothing logged this month yet" : "No transactions yet"}</p>
          <button type="button" onClick={() => openQuickAdd("expense")} className="h-11 rounded-full bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--on-accent)]">
            Log money
          </button>
        </div>
      ) : (
        days.map((day, i) => (
          <section key={day.date} aria-label={dayHeading(day.date)}>
            {i === 0 || days[i - 1].date.slice(0, 7) !== day.date.slice(0, 7) ? (
              <div className="mb-4 mt-2 flex items-baseline justify-between rounded-[18px] bg-[var(--forest)] px-5 py-4 text-white">
                <span className="text-[16px] font-semibold">{monthLabel(day.date.slice(0, 7))}</span>
                <span className="tnum text-[15px]">
                  <span className="text-white/70">Spent </span>
                  {formatMinor(rangeTotals(transactions, monthRange(day.date.slice(0, 7))).expense, currency, { symbol: true })}
                </span>
              </div>
            ) : null}
            <h2 className="mb-2.5 text-center text-[15px] text-[var(--text-muted)]">{dayHeading(day.date)}</h2>
            <ul className="flex flex-col gap-2">
              {day.rows.map((tx) => {
                const open = openId === tx.id;
                return (
                  <li key={tx.id}>
                    <button type="button" className="block w-full text-left" aria-expanded={open} onClick={() => setOpenId(open ? null : tx.id)}>
                      <TxCard tx={tx} categories={categories} currency={currency} />
                    </button>
                    {open ? (
                      <div className="mx-3 -mt-3 rounded-b-[18px] bg-[var(--surface)]/80 px-4 pb-3 pt-5 text-[13px] text-[var(--text-muted)]">
                        <p>
                          {tx.type === "transfer"
                            ? `${accountName(accounts, tx.account_id)} → ${accountName(accounts, tx.to_account_id)}`
                            : `${accountName(accounts, tx.account_id)} · ${categoryName(categories, tx.category_id) || "No category"}`}
                          {" · "}
                          {tx.date}
                        </p>
                        {tx.notes ? <p className="mt-1">{tx.notes}</p> : null}
                        {tx.type !== "transfer" ? (
                          <div className="mt-3">
                            <p className="mb-1.5 text-[12px] font-medium">Change category{saving === tx.id ? " · saving…" : ""}</p>
                            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Category">
                              {activeCategories(categories)
                                .filter((c) => c.kind === (tx.type === "income" ? "income" : "expense"))
                                .map((c) => {
                                  const selected = c.id === tx.category_id;
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      role="radio"
                                      aria-checked={selected}
                                      disabled={saving === tx.id}
                                      onClick={() => void changeCategory(tx, c.id)}
                                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition-colors disabled:opacity-60 ${
                                        selected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--line-strong)] text-[var(--text)]"
                                      }`}
                                    >
                                      {c.name}
                                    </button>
                                  );
                                })}
                            </div>
                          </div>
                        ) : null}
                        <button type="button" onClick={() => void remove(tx)} className="mt-2 inline-flex items-center gap-1.5 font-medium text-[var(--negative)]">
                          <Trash2 className="size-4" strokeWidth={1.75} />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {hasOlder && state !== "loading" ? (
        <button
          type="button"
          onClick={() => setMonthsShown((n) => n + 1)}
          className="mx-auto h-11 rounded-full bg-[var(--surface)] px-5 text-[15px] font-medium text-[var(--accent)] shadow-[0_2px_8px_-4px_rgb(17_24_22/0.12)]"
        >
          Show {monthLabel(shiftMonth(shownMonths[shownMonths.length - 1], -1))}
        </button>
      ) : null}
    </div>
  );
}
