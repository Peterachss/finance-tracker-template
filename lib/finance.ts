import { isInRange, monthRange } from "./dates";
import { sumMinor } from "./money";
import type { Account, Budget, Category, Transaction, TxType } from "./types";

/**
 * The single source of truth for money maths. Every page calls these
 * functions; no page recomputes balances or totals itself.
 *
 * Invariants enforced here and in the database:
 *  - `amount` is always POSITIVE. `type` decides the accounting sign.
 *  - A transfer moves money between two accounts and is therefore excluded
 *    from income, expenses, category spending and net cash flow, while
 *    affecting each of its two accounts exactly once.
 */

export interface DateRange {
  /** Inclusive. */
  start: string;
  /** Exclusive. */
  end: string;
}

export interface RangeTotals {
  income: number;
  expense: number;
  net: number;
}

export function inRange(transactions: Transaction[], range: DateRange): Transaction[] {
  return transactions.filter((tx) => isInRange(tx.date, range.start, range.end));
}

export function rangeTotals(transactions: Transaction[], range: DateRange): RangeTotals {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (!isInRange(tx.date, range.start, range.end)) continue;
    if (tx.type === "income") income += tx.amount;
    else if (tx.type === "expense") expense += tx.amount;
  }
  return { income, expense, net: income - expense };
}

/**
 * balance = opening balance + income - expenses - transfers out + transfers in
 * Accounts are matched by id, so a deleted/archived account is simply ignored.
 */
export function accountBalance(
  account: Pick<Account, "id" | "opening_balance">,
  transactions: Transaction[],
): number {
  let balance = account.opening_balance;
  for (const tx of transactions) {
    if (tx.type === "income" && tx.account_id === account.id) balance += tx.amount;
    else if (tx.type === "expense" && tx.account_id === account.id) balance -= tx.amount;
    else if (tx.type === "transfer") {
      if (tx.account_id === account.id) balance -= tx.amount;
      if (tx.to_account_id === account.id) balance += tx.amount;
    }
  }
  return balance;
}

export function balancesByAccount(
  accounts: Account[],
  transactions: Transaction[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const account of accounts) {
    result[account.id] = accountBalance(account, transactions);
  }
  return result;
}

/**
 * Sum of every open account. Transfers cancel out, so this is true net worth.
 * Archived accounts are left out: "Passed on" holds money that only moved
 * through you (received for someone else and sent on), which isn't yours.
 */
export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return sumMinor(Object.values(balancesByAccount(accounts.filter((a) => !a.archived), transactions)));
}

export interface BalancePeriod {
  /** Chart tick label, e.g. "Jan". */
  key: string;
  /** Exclusive ISO date: the balance shown is everything before this date. */
  end: string;
}

/**
 * Running balance per account at the end of each period — the data behind the
 * "Balance over time" chart.
 *
 * ASSUMPTION, stated because it is a real limitation rather than a detail:
 * `accounts.opening_balance` carries no effective date, so every opening
 * balance is applied at the start of the whole history and the running total
 * accrues from the earliest record. Balances before the first dated transaction
 * are therefore "opening balance only". Nothing here invents a prior history.
 *
 * Each account is its own series, so the chart never implies that a total line
 * is an account line. A period whose end is beyond the last transaction reports
 * exactly `accountBalance`, which is what keeps the final plotted point equal to
 * the account figure shown elsewhere in the app.
 */
export function accountBalanceSeries(
  accounts: Account[],
  transactions: Transaction[],
  periods: BalancePeriod[],
): { period: string; values: Record<string, number> }[] {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const tracked = accounts.map((account) => account.id);

  return periods.map((period) => {
    const running: Record<string, number> = {};
    for (const account of accounts) running[account.id] = account.opening_balance;

    for (const tx of sorted) {
      // Sorted, so the first row past this point ends the period.
      if (tx.date >= period.end) break;

      if (tx.type === "income") {
        if (tx.account_id in running) running[tx.account_id] += tx.amount;
      } else if (tx.type === "expense") {
        if (tx.account_id in running) running[tx.account_id] -= tx.amount;
      } else if (tx.type === "transfer") {
        if (tx.account_id in running) running[tx.account_id] -= tx.amount;
        if (tx.to_account_id && tracked.includes(tx.to_account_id)) running[tx.to_account_id] += tx.amount;
      }
    }

    return { period: period.key, values: running };
  });
}

export interface CategorySpend {
  category_id: string;
  amount: number;
}

/** Expenses only, grouped by category. Transfers and income never appear. */
export function spendingByCategory(
  transactions: Transaction[],
  range: DateRange,
): CategorySpend[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    if (!isInRange(tx.date, range.start, range.end)) continue;
    const key = tx.category_id ?? "__uncategorised__";
    totals.set(key, (totals.get(key) ?? 0) + tx.amount);
  }
  return [...totals.entries()]
    .map(([category_id, amount]) => ({ category_id, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function expensesForCategory(
  transactions: Transaction[],
  range: DateRange,
  categoryId: string,
): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    if (tx.category_id !== categoryId) continue;
    if (!isInRange(tx.date, range.start, range.end)) continue;
    total += tx.amount;
  }
  return total;
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export function monthlyTrend(
  transactions: Transaction[],
  months: string[],
): MonthPoint[] {
  return months.map((month) => {
    const totals = rangeTotals(transactions, monthRange(month));
    return { month, ...totals };
  });
}

export function monthRangeOf(month: string): DateRange {
  return monthRange(month);
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percentUsed: number;
  level: "ok" | "warning" | "over";
}

/**
 * Budgets count expenses only. A category budget measures that category;
 * the overall budget (category_id === null) measures ALL expenses, which
 * already includes the categorised ones — it is never added to them.
 */
export function budgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  month: string,
): BudgetProgress[] {
  const range = monthRange(month);
  return budgets
    .filter((budget) => budget.month === month)
    .map((budget) => {
      const spent =
        budget.category_id === null
          ? rangeTotals(transactions, range).expense
          : expensesForCategory(transactions, range, budget.category_id);
      const remaining = budget.amount - spent;
      const percentUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      // 80% warns, reaching or passing the limit is "over".
      const level: BudgetProgress["level"] =
        budget.amount <= 0 ? "ok" : spent >= budget.amount ? "over" : percentUsed >= 80 ? "warning" : "ok";
      return { budget, spent, remaining, percentUsed, level };
    })
    .sort((a, b) => {
      if (a.budget.category_id === null) return -1;
      if (b.budget.category_id === null) return 1;
      return b.percentUsed - a.percentUsed;
    });
}

export function categoryName(categories: Category[], id: string | null): string {
  if (id === null) return "Uncategorised";
  return categories.find((category) => category.id === id)?.name ?? "Uncategorised";
}

export function accountName(accounts: Account[], id: string | null): string {
  if (id === null) return "—";
  return accounts.find((account) => account.id === id)?.name ?? "Unknown account";
}

export function isTxType(value: unknown): value is TxType {
  return value === "income" || value === "expense" || value === "transfer";
}

export function recentTransactions(transactions: Transaction[], limit: number): Transaction[] {
  return [...transactions]
    .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)))
    .slice(0, limit);
}