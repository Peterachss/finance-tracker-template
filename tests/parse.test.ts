import { describe, expect, it } from "vitest";
import { parseDateInput, isIsoDate, monthRange, shiftMonth } from "@/lib/dates";
import { parseAmountInput, parseBlock, parseRow, type ParseContext } from "@/lib/parse";
import { transactionsToCsv } from "@/lib/csv";
import { findDuplicateCandidates } from "@/lib/duplicates";
import { decimalStringToMinor, formatMinor, minorToDecimalString } from "@/lib/money";
import { normalizeMatrix, parseDelimited, SHEET_COLUMNS } from "@/lib/sheet";
import type { Transaction, TransactionInput } from "@/lib/types";

const context: ParseContext = {
  accounts: [
    { id: "a1", user_id: "u1", name: "Cash", kind: "cash", currency: "VND", opening_balance: 0, archived: false, created_at: "" },
    { id: "a2", user_id: "u1", name: "Bank", kind: "bank", currency: "VND", opening_balance: 0, archived: false, created_at: "" },
    { id: "a3", user_id: "u1", name: "Old Wallet", kind: "ewallet", currency: "VND", opening_balance: 0, archived: true, created_at: "" },
  ],
  categories: [
    { id: "c1", user_id: "u1", name: "Food", kind: "expense", archived: false, created_at: "" },
    { id: "c2", user_id: "u1", name: "Salary", kind: "income", archived: false, created_at: "" },
    { id: "c3", user_id: "u1", name: "Retired", kind: "expense", archived: true, created_at: "" },
  ],
  currency: "VND",
};

describe("money conversion", () => {
  it("converts between minor units and decimal strings exactly", () => {
    expect(minorToDecimalString(8_500_000)).toBe("85000.00");
    expect(decimalStringToMinor("85000.00")).toBe(8_500_000);
    expect(decimalStringToMinor("1234.56")).toBe(123_456);
    expect(minorToDecimalString(123_456)).toBe("1234.56");
    expect(decimalStringToMinor("-5.05")).toBe(-505);
  });

  it("rejects malformed decimals instead of returning 0", () => {
    expect(() => decimalStringToMinor("abc")).toThrow();
    expect(() => decimalStringToMinor("")).toThrow();
    expect(() => decimalStringToMinor("1.234")).toThrow();
  });

  it("formats VND without decimals", () => {
    expect(formatMinor(8_500_000, "VND")).toMatch(/85\.000\s*VND/);
    expect(formatMinor(8_500_000, "VND")).not.toMatch(",00");
  });
});

describe("date parsing", () => {
  it("accepts ISO and unambiguous slash forms", () => {
    expect(parseDateInput("2026-04-13")).toEqual({ ok: true, value: "2026-04-13" });
    expect(parseDateInput("13/04/2026")).toEqual({ ok: true, value: "2026-04-13" });
    expect(parseDateInput("04/13/2026")).toEqual({ ok: true, value: "2026-04-13" });
    expect(parseDateInput("2026/4/3")).toEqual({ ok: true, value: "2026-04-03" });
  });

  it("flags an ambiguous date instead of assuming a locale", () => {
    const result = parseDateInput("03/04/2026");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Ambiguous/);
  });

  it("rejects impossible calendar dates", () => {
    expect(parseDateInput("2026-02-30").ok).toBe(false);
    expect(parseDateInput("2026-13-01").ok).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });

  it("rejects junk rather than defaulting", () => {
    expect(parseDateInput("tomorrow").ok).toBe(false);
    expect(parseDateInput("").ok).toBe(false);
  });

  it("parses Excel serial dates only when explicitly allowed", () => {
    expect(parseDateInput("45000", { allowExcelSerial: true })).toEqual({ ok: true, value: "2023-03-15" });
    expect(parseDateInput("45000").ok).toBe(false);
  });

  it("computes month ranges and shifts", () => {
    expect(monthRange("2026-04")).toEqual({ start: "2026-04-01", end: "2026-05-01" });
    expect(shiftMonth("2026-04", -1)).toBe("2026-03");
    expect(shiftMonth("2026-04", 12)).toBe("2027-04");
  });
});

describe("amount parsing", () => {
  it("reads plain, grouped and spaced numbers", () => {
    expect(parseAmountInput("85000")).toEqual({ ok: true, value: { minor: 8_500_000, wasNegative: false } });
    expect(parseAmountInput("85,000")).toEqual({ ok: true, value: { minor: 8_500_000, wasNegative: false } });
    expect(parseAmountInput("85 000")).toEqual({ ok: true, value: { minor: 8_500_000, wasNegative: false } });
    expect(parseAmountInput("₫85.000")).toEqual({ ok: true, value: { minor: 8_500_000, wasNegative: false } });
    expect(parseAmountInput("1,234.56")).toEqual({ ok: true, value: { minor: 123_456, wasNegative: false } });
    expect(parseAmountInput("1 234,56")).toEqual({ ok: true, value: { minor: 123_456, wasNegative: false } });
  });

  it("records a negative source value without flipping the stored sign", () => {
    expect(parseAmountInput("-500")).toEqual({ ok: true, value: { minor: 50_000, wasNegative: true } });
    expect(parseAmountInput("(500)")).toEqual({ ok: true, value: { minor: 50_000, wasNegative: true } });
  });

  it("refuses badly sized digit groups instead of guessing", () => {
    const result = parseAmountInput("1.2345");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Ambiguous|malformed/);
    expect(parseAmountInput("12,34,567").ok).toBe(false);
  });

  it("rejects zero, empty and unrecognised amounts", () => {
    expect(parseAmountInput("0").ok).toBe(false);
    expect(parseAmountInput("").ok).toBe(false);
    expect(parseAmountInput("abc").ok).toBe(false);
    expect(parseAmountInput("-").ok).toBe(false);
  });
});

describe("row validation", () => {
  const good = { date: "2026-03-01", description: "Lunch", type: "Expense", category: "Food", account: "Cash", amount: "85000" };

  it("accepts a clean row", () => {
    const parsed = parseRow(good, 1, context);
    expect(parsed.issues).toEqual([]);
    expect(parsed.input).toEqual({
      date: "2026-03-01",
      description: "Lunch",
      type: "expense",
      category_id: "c1",
      account_id: "a1",
      to_account_id: null,
      amount: 8_500_000,
      notes: "",
    });
  });

  it("surfaces an invalid date with the row number and reason", () => {
    const parsed = parseRow({ ...good, date: "03/04/2026" }, 7, context);
    expect(parsed.input).toBeNull();
    expect(parsed.issues).toContainEqual(expect.objectContaining({ row: 7, field: "date" }));
  });

  it("surfaces an invalid amount rather than storing zero", () => {
    const parsed = parseRow({ ...good, amount: "1.2345" }, 2, context);
    expect(parsed.input).toBeNull();
    expect(parsed.issues.some((i) => i.field === "amount")).toBe(true);
  });

  it("rejects an unknown account or category by name", () => {
    const parsed = parseRow({ ...good, account: "Wallet X", category: "Nope" }, 1, context);
    expect(parsed.issues.map((i) => i.field).sort()).toEqual(["account", "category"]);
  });

  it("rejects a category that belongs to the other type", () => {
    const parsed = parseRow({ ...good, category: "Salary" }, 1, context);
    expect(parsed.issues.some((i) => i.field === "category")).toBe(true);
  });

  it("requires a destination account for a transfer and forbids it elsewhere", () => {
    const missing = parseRow({ ...good, type: "Transfer", category: "" }, 1, context);
    expect(missing.issues.some((i) => i.field === "to_account")).toBe(true);

    const same = parseRow({ ...good, type: "Transfer", category: "", to_account: "Cash" }, 1, context);
    expect(same.issues.some((i) => i.field === "to_account")).toBe(true);

    const extra = parseRow({ ...good, to_account: "Bank" }, 1, context);
    expect(extra.issues.some((i) => i.field === "to_account")).toBe(true);

    const good2 = parseRow({ ...good, type: "Transfer", category: "", to_account: "Bank" }, 1, context);
    expect(good2.input?.to_account_id).toBe("a2");
  });

  it("forbids a category on a transfer", () => {
    const parsed = parseRow({ ...good, type: "Transfer", category: "Food", to_account: "Bank" }, 1, context);
    expect(parsed.issues.some((i) => i.field === "category")).toBe(true);
  });

  it("infers Expense from a negative amount when no type is given", () => {
    const parsed = parseRow({ ...good, type: "", amount: "-500" }, 1, context);
    expect(parsed.input?.type).toBe("expense");
    expect(parsed.input?.amount).toBe(50_000);
    expect(parsed.warnings.some((w) => w.field === "type")).toBe(true);
  });

  it("flags a negative amount that contradicts Income rather than flipping it", () => {
    const parsed = parseRow({ ...good, type: "Income", category: "", amount: "-500" }, 1, context);
    expect(parsed.input).toBeNull();
    expect(parsed.issues.some((i) => i.field === "amount")).toBe(true);
  });

  it("resolves archived categories for historical rows", () => {
    const parsed = parseRow({ ...good, category: "Retired" }, 1, context);
    expect(parsed.input?.category_id).toBe("c3");
  });
});

describe("block parsing", () => {
  const csv = [
    "Date,Description,Type,Category,Account,Amount",
    "2026-03-01,Lunch,Expense,Food,Cash,85000",
    "03/04/2026,Bad date,Expense,Food,Cash,500",
    "2026-03-02,Pay,Income,Salary,Bank,2000000",
  ].join("\n");

  it("maps headers and reports the row number of every invalid row", () => {
    const matrix = normalizeMatrix(parseDelimited(csv, ","));
    const mapping = matrix[0].map((header) => header.trim().toLowerCase() === "date" ? "date" as const : null);
    const full: (typeof SHEET_COLUMNS)[number][] = ["date", "description", "type", "category", "account", "amount"];

    const rows = parseBlock(matrix.slice(1), full, context);
    expect(rows).toHaveLength(3);
    expect(rows[0].input).not.toBeNull();
    expect(rows[1].input).toBeNull();
    expect(rows[1].issues[0]).toMatchObject({ row: 2, field: "date" });
    expect(rows[2].input?.amount).toBe(200_000_000);
    expect(mapping[0]).toBe("date");
  });

  it("ignores unmapped columns without guessing", () => {
    const matrix = normalizeMatrix(parseDelimited("Date,Bank Reference,Amount", ","));
    const rows = parseBlock(matrix, ["date", null, "amount"], context);
    expect(rows).toHaveLength(1);
    expect(rows[0].issues.some((i) => i.field === "description")).toBe(true);
  });
});

describe("duplicate detection", () => {
  const existing: Transaction[] = [
    {
      id: "tx-1", user_id: "u1", date: "2026-03-01", description: "Lunch", type: "expense",
      category_id: "c1", account_id: "a1", to_account_id: null, amount: 8_500_000, notes: "",
      created_at: "2026-03-01T10:00:00Z", updated_at: "2026-03-01T10:00:00Z", version: 1,
    },
  ];

  const input = (over: Partial<TransactionInput> = {}): TransactionInput => ({
    date: "2026-03-01", description: "lunch", type: "expense", category_id: "c1",
    account_id: "a1", to_account_id: null, amount: 8_500_000, notes: "", ...over,
  });

  it("reports a likely duplicate without changing anything", () => {
    const matches = findDuplicateCandidates([{ row: 1, description: "Lunch", input: input() }], existing);
    expect(matches).toEqual([
      { row: 1, description: "Lunch", existing_id: "tx-1", existing_date: "2026-03-01", existing_amount: 8_500_000 },
    ]);
    expect(existing).toHaveLength(1);
  });

  it("does not match a different amount, date, account or type", () => {
    expect(findDuplicateCandidates([{ row: 1, description: "x", input: input({ amount: 1 }) }], existing)).toEqual([]);
    expect(findDuplicateCandidates([{ row: 1, description: "x", input: input({ date: "2026-03-02" }) }], existing)).toEqual([]);
    expect(findDuplicateCandidates([{ row: 1, description: "x", input: input({ account_id: "a2" }) }], existing)).toEqual([]);
    expect(findDuplicateCandidates([{ row: 1, description: "x", input: input({ type: "income" }) }], existing)).toEqual([]);
  });
});

describe("CSV export", () => {
  const transaction: Transaction = {
    id: "tx-1", user_id: "u1", date: "2026-03-01", description: '=HYPERLINK("evil")',
    type: "expense", category_id: "c1", account_id: "a1", to_account_id: null,
    amount: 8_500_000, notes: "a,b", created_at: "", updated_at: "", version: 1,
  };

  it("escapes formula-looking text so opening the file cannot execute it", () => {
    const csv = transactionsToCsv([transaction], context.categories, context.accounts);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/^=HYPERLINK/m);
  });

  it("quotes fields containing commas and ends with a newline", () => {
    const csv = transactionsToCsv([transaction], context.categories, context.accounts);
    expect(csv).toContain('"a,b"');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe("id,date,description,type,category,account,to_account,amount,notes,version");
  });

  it("round-trips a transaction back into a row", () => {
    const csv = transactionsToCsv([transaction], context.categories, context.accounts);
    const matrix = normalizeMatrix(parseDelimited(csv.split("\r\n")[1], ","));
    expect(matrix[0][1]).toBe("2026-03-01");
    expect(decimalStringToMinor(matrix[0][7])).toBe(8_500_000);
  });
});