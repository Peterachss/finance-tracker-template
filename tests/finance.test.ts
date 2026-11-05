import { describe, expect, it } from "vitest";
import {
  accountBalance,
  accountBalanceSeries,
  balancesByAccount,
  budgetProgress,
  expensesForCategory,
  monthlyTrend,
  rangeTotals,
  spendingByCategory,
  totalBalance,
} from "@/lib/finance";
import { monthRange, shiftMonth } from "@/lib/dates";
import { sumMinor } from "@/lib/money";
import type { Account, Budget, Transaction } from "@/lib/types";

const MINOR = 100;

function account(id: string, openingMinor: number): Account {
  return {
    id,
    user_id: "u1",
    name: id,
    kind: "cash",
    currency: "VND",
    opening_balance: openingMinor,
    archived: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

let seq = 0;
function tx(partial: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "date">): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: "u1",
    description: "row",
    category_id: null,
    account_id: "cash",
    to_account_id: null,
    notes: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    version: 1,
    ...partial,
  };
}

describe("account balances", () => {
  it("applies opening balance + income - expenses - transfers out + transfers in", () => {
    const cash = account("cash", 100_000 * MINOR);
    const bank = account("bank", 50_000 * MINOR);
    const transactions: Transaction[] = [
      tx({ type: "income", amount: 20_000 * MINOR, account_id: "cash", date: "2026-03-01" }),
      tx({ type: "expense", amount: 5_000 * MINOR, account_id: "cash", date: "2026-03-02" }),
      tx({
        type: "transfer",
        amount: 30_000 * MINOR,
        account_id: "cash",
        to_account_id: "bank",
        date: "2026-03-03",
      }),
    ];

    expect(accountBalance(cash, transactions)).toBe((100_000 + 20_000 - 5_000 - 30_000) * MINOR);
    expect(accountBalance(bank, transactions)).toBe((50_000 + 30_000) * MINOR);
  });

  it("counts a transfer once on each side, never twice on one side", () => {
    const cash = account("cash", 0);
    const bank = account("bank", 0);
    const transactions = [
      tx({ type: "transfer", amount: 12_000 * MINOR, account_id: "cash", to_account_id: "bank", date: "2026-03-03" }),
    ];
    const balances = balancesByAccount([cash, bank], transactions);
    expect(balances.cash).toBe(-12_000 * MINOR);
    expect(balances.bank).toBe(12_000 * MINOR);
    // Transfers are internal, so total net worth is unchanged.
    expect(totalBalance([cash, bank], transactions)).toBe(0);
  });

  it("sums every account into a total balance", () => {
    const transactions = [
      tx({ type: "income", amount: 10_000 * MINOR, account_id: "bank", date: "2026-03-01" }),
      tx({ type: "expense", amount: 1_500 * MINOR, account_id: "cash", date: "2026-03-01" }),
      tx({ type: "transfer", amount: 2_000 * MINOR, account_id: "bank", to_account_id: "cash", date: "2026-03-02" }),
    ];
    expect(totalBalance([account("cash", 5_000 * MINOR), account("bank", 1_000 * MINOR)], transactions)).toBe(
      (5_000 + 1_000 + 10_000 - 1_500) * MINOR,
    );
  });
});

describe("range totals", () => {
  const transactions: Transaction[] = [
    tx({ type: "income", amount: 30_000 * MINOR, account_id: "cash", date: "2026-03-05" }),
    tx({ type: "expense", amount: 4_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-03-10" }),
    tx({ type: "expense", amount: 1_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-03-31" }),
    tx({ type: "expense", amount: 9_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-04-01" }),
    tx({ type: "transfer", amount: 999_999 * MINOR, account_id: "cash", to_account_id: "bank", date: "2026-03-15" }),
  ];

  it("excludes transfers from income and expenses", () => {
    const totals = rangeTotals(transactions, monthRange("2026-03"));
    expect(totals.income).toBe(30_000 * MINOR);
    expect(totals.expense).toBe(5_000 * MINOR);
    expect(totals.net).toBe(25_000 * MINOR);
  });

  it("uses an inclusive start and an exclusive end", () => {
    const range = monthRange("2026-03");
    expect(range).toEqual({ start: "2026-03-01", end: "2026-04-01" });
    // 2026-03-31 is inside, 2026-04-01 is outside.
    expect(rangeTotals(transactions, range).expense).toBe(5_000 * MINOR);
  });

  it("crosses a year boundary correctly", () => {
    const december = [
      tx({ type: "expense", amount: 7 * MINOR, account_id: "cash", date: "2026-12-31" }),
      tx({ type: "expense", amount: 11 * MINOR, account_id: "cash", date: "2027-01-01" }),
    ];
    expect(rangeTotals(december, monthRange("2026-12")).expense).toBe(7 * MINOR);
    expect(rangeTotals(december, monthRange("2027-01")).expense).toBe(11 * MINOR);
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("handles February in a leap year", () => {
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-03-01" });
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-03-01" });
  });
});

describe("category spending", () => {
  const transactions: Transaction[] = [
    tx({ type: "expense", amount: 4_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-03-02" }),
    tx({ type: "expense", amount: 2_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-03-03" }),
    tx({ type: "expense", amount: 6_000 * MINOR, account_id: "cash", category_id: "travel", date: "2026-03-04" }),
    tx({ type: "income", amount: 99_000 * MINOR, account_id: "cash", category_id: "salary", date: "2026-03-05" }),
    tx({ type: "transfer", amount: 50_000 * MINOR, account_id: "cash", to_account_id: "bank", date: "2026-03-06" }),
    tx({ type: "expense", amount: 1_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-02-10" }),
  ];

  it("groups expenses only, largest first", () => {
    const rows = spendingByCategory(transactions, monthRange("2026-03"));
    expect(rows.map((row) => row.category_id).sort()).toEqual(["food", "travel"]);
    expect(rows[0].amount).toBe(6_000 * MINOR);
    expect(rows[0].amount).toBeGreaterThanOrEqual(rows[1].amount);
  });

  it("never counts income or transfers as category spending", () => {
    const byCategory = spendingByCategory(transactions, monthRange("2026-03"));
    expect(byCategory.some((row) => row.category_id === "salary")).toBe(false);
    expect(byCategory.reduce((sum, row) => sum + row.amount, 0)).toBe(12_000 * MINOR);
  });

  it("counts one category across a range", () => {
    expect(expensesForCategory(transactions, monthRange("2026-02"), "food")).toBe(1_000 * MINOR);
    expect(expensesForCategory(transactions, monthRange("2026-03"), "food")).toBe(6_000 * MINOR);
  });
});

describe("monthly trend", () => {
  it("produces one point per month and ignores transfers", () => {
    const transactions = [
      tx({ type: "income", amount: 10_000 * MINOR, account_id: "cash", date: "2026-01-15" }),
      tx({ type: "expense", amount: 2_000 * MINOR, account_id: "cash", date: "2026-02-10" }),
      tx({ type: "transfer", amount: 5_000 * MINOR, account_id: "cash", to_account_id: "bank", date: "2026-02-11" }),
    ];
    expect(monthlyTrend(transactions, ["2026-01", "2026-02", "2026-03"])).toEqual([
      { month: "2026-01", income: 10_000 * MINOR, expense: 0, net: 10_000 * MINOR },
      { month: "2026-02", income: 0, expense: 2_000 * MINOR, net: -2_000 * MINOR },
      { month: "2026-03", income: 0, expense: 0, net: 0 },
    ]);
  });
});

describe("budget progress", () => {
  const transactions = [
    tx({ type: "expense", amount: 4_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-03-05" }),
    tx({ type: "expense", amount: 2_000 * MINOR, account_id: "cash", category_id: "travel", date: "2026-03-06" }),
    tx({ type: "income", amount: 90_000 * MINOR, account_id: "cash", category_id: "salary", date: "2026-03-07" }),
    tx({ type: "transfer", amount: 70_000 * MINOR, account_id: "cash", to_account_id: "bank", date: "2026-03-08" }),
    tx({ type: "expense", amount: 9_000 * MINOR, account_id: "cash", category_id: "food", date: "2026-04-01" }),
  ];

  const budgets: Budget[] = [
    { id: "b1", user_id: "u1", month: "2026-03", category_id: null, amount: 10_000 * MINOR, created_at: "" },
    { id: "b2", user_id: "u1", month: "2026-03", category_id: "food", amount: 5_000 * MINOR, created_at: "" },
  ];

  it("measures expenses only, so income and transfers cannot inflate progress", () => {
    const [overall, food] = budgetProgress(budgets, transactions, "2026-03");
    expect(overall.spent).toBe(6_000 * MINOR);
    expect(food.spent).toBe(4_000 * MINOR);
  });

  it("computes remaining and percentage used", () => {
    const [overall, food] = budgetProgress(budgets, transactions, "2026-03");
    expect(overall.remaining).toBe(4_000 * MINOR);
    expect(overall.percentUsed).toBeCloseTo(60);
    expect(food.remaining).toBe(1_000 * MINOR);
    expect(food.percentUsed).toBeCloseTo(80);
  });

  it("warns at 80% and flags over budget at 100%", () => {
    const april: Budget[] = [
      { id: "b4", user_id: "u1", month: "2026-04", category_id: "food", amount: 5_000 * MINOR, created_at: "" },
    ];
    // 9,000 spent against a 5,000 limit.
    const warning = budgetProgress(april, transactions, "2026-04");
    expect(warning[0].spent).toBe(9_000 * MINOR);
    expect(warning[0].percentUsed).toBeCloseTo(180);
    expect(warning[0].level).toBe("over");

    // Exactly 80% of the March food budget (4,000 of 5,000).
    const [marchFood] = budgetProgress(budgets, transactions, "2026-03").slice(1);
    expect(marchFood.level).toBe("warning");

    const tight: Budget[] = [
      { id: "b3", user_id: "u1", month: "2026-03", category_id: null, amount: 6_000 * MINOR, created_at: "" },
    ];
    // Exactly at the limit counts as over.
    expect(budgetProgress(tight, transactions, "2026-03")[0].level).toBe("over");
  });

  it("treats a zero budget as not configured", () => {
    const zero: Budget[] = [
      { id: "b5", user_id: "u1", month: "2026-03", category_id: null, amount: 0, created_at: "" },
    ];
    const [overall] = budgetProgress(zero, transactions, "2026-03");
    expect(overall.level).toBe("ok");
    expect(overall.percentUsed).toBe(0);
  });

  it("ignores budgets from other months", () => {
    expect(budgetProgress(budgets, transactions, "2026-05")).toEqual([]);
  });
});

describe("accountBalanceSeries", () => {
  const cash = account("cash", 100_00);
  const card = account("card", 0);

  const history: Transaction[] = [
    tx({ type: "income", amount: 500_00, date: "2026-01-10", account_id: "cash" }),
    tx({ type: "expense", amount: 120_00, date: "2026-02-03", account_id: "cash" }),
    tx({ type: "transfer", amount: 200_00, date: "2026-02-10", account_id: "cash", to_account_id: "card" }),
    tx({ type: "expense", amount: 30_00, date: "2026-03-05", account_id: "card" }),
  ];

  const periods = [
    { key: "Jan", end: monthRange("2026-01").end },
    { key: "Feb", end: monthRange("2026-02").end },
    { key: "Mar", end: monthRange("2026-03").end },
  ];

  it("accumulates opening balance plus flows up to each period end", () => {
    const series = accountBalanceSeries([cash, card], history, periods);

    // Cash: 100 opening, +500 in January.
    expect(series[0].values.cash).toBe(600_00);
    // Cash: -120 February, then -200 transferred out.
    expect(series[1].values.cash).toBe(280_00);
    expect(series[2].values.cash).toBe(280_00);
  });

  it("applies a transfer to both accounts exactly once", () => {
    const series = accountBalanceSeries([cash, card], history, periods);

    expect(series[1].values.card).toBe(200_00);
    expect(series[2].values.card).toBe(170_00);
  });

  it("reports the opening balance for a period before any transaction", () => {
    const series = accountBalanceSeries([cash, card], history, [
      { key: "2025", end: "2026-01-01" },
      ...periods,
    ]);

    // Opening balances have no effective date, so this is the documented floor.
    expect(series[0].values.cash).toBe(100_00);
    expect(series[0].values.card).toBe(0);
  });

  it("agrees with accountBalance once the period runs past the last row", () => {
    const series = accountBalanceSeries([cash, card], history, [
      ...periods,
      { key: "Later", end: "2030-01-01" },
    ]);
    const last = series[series.length - 1];

    // The final plotted point must equal the figure shown elsewhere in the app.
    expect(last.values.cash).toBe(accountBalance(cash, history));
    expect(last.values.card).toBe(accountBalance(card, history));
    expect(sumMinor(Object.values(last.values))).toBe(totalBalance([cash, card], history));
  });

  it("keeps each account as its own series and ignores unknown accounts", () => {
    const series = accountBalanceSeries([cash], history, periods);

    expect(Object.keys(series[0].values)).toEqual(["cash"]);

    // A transaction pointing at a deleted account must not create a new series.
    const orphan = tx({ type: "expense", amount: 99_00, date: "2026-02-01", account_id: "gone" });
    const after = accountBalanceSeries([cash], [...history, orphan], periods);
    expect(Object.keys(after[0].values)).toEqual(["cash"]);
    expect(after[1].values.cash).toBe(series[1].values.cash);
  });

  it("is unaffected by the input order", () => {
    const shuffled = [...history].reverse();
    expect(accountBalanceSeries([cash, card], shuffled, periods)).toEqual(
      accountBalanceSeries([cash, card], history, periods),
    );
  });
});

describe("dashboard series integrity", () => {
  const months = ["2026-01", "2026-02", "2026-03"];

  const rows: Transaction[] = [
    tx({ type: "income", amount: 300_00, date: "2026-01-05", account_id: "cash" }),
    tx({ type: "expense", amount: 40_00, date: "2026-01-09", account_id: "cash" }),
    // A large transfer: if it leaked into the series the bars would be wrong.
    tx({ type: "transfer", amount: 9_000_00, date: "2026-02-14", account_id: "cash", to_account_id: "card" }),
    tx({ type: "expense", amount: 60_00, date: "2026-02-20", account_id: "card" }),
    tx({ type: "income", amount: 100_00, date: "2026-03-02", account_id: "cash" }),
  ];

  const trend = monthlyTrend(rows, months);

  it("excludes transfers from the inflows and outflows series", () => {
    const february = trend.find((p) => p.month === "2026-02");

    expect(february?.income).toBe(0);
    // Only the 60.00 expense counts. The 9,000.00 transfer must not appear.
    expect(february?.expense).toBe(60_00);
    expect(february?.net).toBe(-60_00);
  });

  it("reports each month independently and in the requested order", () => {
    expect(trend.map((p) => p.month)).toEqual(months);
    expect(trend[0]).toMatchObject({ income: 300_00, expense: 40_00, net: 260_00 });
    expect(trend[2]).toMatchObject({ income: 100_00, expense: 0, net: 100_00 });
  });

  it("returns zero for a month with no records rather than omitting it", () => {
    const empty = monthlyTrend(rows, ["2025-12"]);
    expect(empty).toHaveLength(1);
    expect(empty[0]).toMatchObject({ month: "2025-12", income: 0, expense: 0, net: 0 });
  });

  it("keeps a transfer neutral in net cash flow while it still moves a balance", () => {
    const cash = account("cash", 0);
    const card = account("card", 0);

    // The transfer changes both account balances but no income/expense figure.
    expect(accountBalance(cash, rows)).toBe(300_00 + 100_00 - 40_00 - 9_000_00);
    expect(accountBalance(card, rows)).toBe(9_000_00 - 60_00);
    // 300 + 100 income, minus both expenses. The 9,000 transfer is absent.
    expect(trend.reduce((sum, p) => sum + p.net, 0)).toBe(300_00 + 100_00 - 40_00 - 60_00);
  });

  it("keeps the final plotted balance equal to the account balance at any range end", () => {
    const cash = account("cash", 50_00);
    const card = account("card", 0);

    // A range whose last period extends well past the last dated row.
    const periods = [{ key: "Jan", end: "2026-02-01" }, { key: "Later", end: "2031-01-01" }];
    const series = accountBalanceSeries([cash, card], rows, periods);

    expect(series[1].values.cash).toBe(accountBalance(cash, rows));
    expect(series[1].values.card).toBe(accountBalance(card, rows));
  });
});