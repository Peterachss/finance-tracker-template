import { parseDateInput } from "./dates";
import { SHEET_COLUMNS, type SheetField } from "./sheet";
import { CURRENCIES, MINOR_SCALE } from "./money";
import type { Account, Category, CurrencyCode, TransactionInput, TxType } from "./types";

/**
 * Turn pasted/typed text into validated `TransactionInput` rows.
 *
 * Nothing here guesses silently. Anything ambiguous or unrecognised becomes an
 * issue with a human-readable reason, and a row with issues is never sent to
 * the database.
 */

export interface RowIssue {
  /** 1-based position of the row inside the imported block. */
  row: number;
  field: SheetField | "row";
  reason: string;
}

export interface ParsedRow {
  row: number;
  /** Normalised text per sheet column, after header mapping. */
  cells: Partial<Record<SheetField, string>>;
  input: TransactionInput | null;
  issues: RowIssue[];
  warnings: RowIssue[];
}

export interface ParseContext {
  accounts: Account[];
  categories: Category[];
  currency: CurrencyCode;
  allowExcelSerial?: boolean;
  /** Used when the row omits an account. Null makes it an issue instead. */
  defaultAccountId?: string | null;
}

export const TYPE_VARIANTS: Record<string, TxType> = {
  income: "income",
  "in": "income",
  earn: "income",
  revenue: "income",
  thu: "income",
  "thu nhap": "income",
  expense: "expense",
  exp: "expense",
  spend: "expense",
  spending: "expense",
  out: "expense",
  chi: "expense",
  "chi phi": "expense",
  transfer: "transfer",
  "transfer out": "transfer",
  "transfer in": "transfer",
  "chuyen khoan": "transfer",
};

export function isBlankRow(cells: Partial<Record<SheetField, string>>): boolean {
  return SHEET_COLUMNS.every((field) => (cells[field] ?? "").trim() === "");
}

function lookupAccount(accounts: Account[], raw: string): Account | undefined {
  const key = raw.trim().toLowerCase();
  if (key === "") return undefined;
  return (
    accounts.find((a) => a.name.toLowerCase() === key && !a.archived) ??
    accounts.find((a) => a.name.toLowerCase() === key)
  );
}

function lookupCategory(categories: Category[], raw: string): Category | undefined {
  const key = raw.trim().toLowerCase();
  if (key === "") return undefined;
  return (
    categories.find((c) => c.name.toLowerCase() === key && !c.archived) ??
    categories.find((c) => c.name.toLowerCase() === key)
  );
}

export interface AmountParse {
  minor: number;
  wasNegative: boolean;
}

/**
 * Split grouped text into plain digits.
 *
 * The decimal separator is the LAST separator when exactly one or two digits
 * follow it (`1,23` / `1.23`). Everything before it must be a plain integer or
 * groups of exactly three digits (`85.000`, `1,234`). Any other shape is
 * rejected rather than guessed.
 */
function stripGrouping(text: string): { integer: string; fraction: string } | null {
  const lastSeparator = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));

  let integerPart = text;
  let fractionPart = "";
  if (lastSeparator !== -1) {
    const trailing = text.length - lastSeparator - 1;
    if (trailing === 1 || trailing === 2) {
      integerPart = text.slice(0, lastSeparator);
      fractionPart = text.slice(lastSeparator + 1);
    }
  }

  const hasGrouping = /[.,]/.test(integerPart);
  const integerIsValid = hasGrouping
    ? /^\d{1,3}([.,]\d{3})*$/.test(integerPart)
    : /^\d+$/.test(integerPart);
  if (!integerIsValid) return null;

  return { integer: integerPart.replace(/[.,]/g, ""), fraction: fractionPart };
}

/**
 * Accepts `85000`, `85,000`, `85 000`, `₫85.000`, `1,234.56`, `1 234,56`.
 *
 * A separator followed by exactly three digits is always read as a thousands
 * group. Values whose digit groups have the wrong size (for example
 * `1.2345`) are rejected instead of being interpreted by guesswork.
 */
export function parseAmountInput(raw: string): { ok: true; value: AmountParse } | { ok: false; reason: string } {
  let text = raw.trim();
  if (text === "") return { ok: false, reason: "Amount is empty" };

  let wasNegative = false;
  const parentheses = /^\((.*)\)$/.exec(text);
  if (parentheses) {
    wasNegative = true;
    text = parentheses[1].trim();
  }

  // Remove currency symbols/codes and all whitespace, including NBSP/NNBSP.
  text = text
    .replace(/[₫đ$]|\bVND\b|\bUSD\b|\bAUD\b/gi, "")
    .replace(/[\s\u00a0\u202f\u2009]/g, "");
  if (text === "") return { ok: false, reason: "Amount has no digits" };

  if (text.startsWith("-")) {
    wasNegative = true;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  if (!/^[\d.,]+$/.test(text)) {
    return { ok: false, reason: `Unrecognised amount "${raw}"` };
  }

  const parts = stripGrouping(text);
  if (parts === null) {
    return {
      ok: false,
      reason: `Ambiguous or malformed amount "${raw}" — separate thousands groups must be exactly three digits. Re-enter it as a plain number, for example 85000 or 1234.56.`,
    };
  }

  // The fraction is a decimal part, so pad it to two digits of minor units.
  const minor =
    Number(parts.integer) * MINOR_SCALE + Number(parts.fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    return { ok: false, reason: `Amount must be greater than zero (got "${raw}")` };
  }
  return { ok: true, value: { minor, wasNegative } };
}

/** Decimal places present in the source text, so VND can warn about fractions. */
function hasFractionDigits(raw: string): boolean {
  const cleaned = raw.replace(/[\s\u00a0]/g, "");
  return /\.\d{1,2}$/.test(cleaned) && !/^\d{1,3}(,\d{3})+/.test(cleaned);
}

export function parseTypeInput(
  raw: string,
  wasNegative: boolean,
): { ok: true; value: TxType | null; inferred: boolean } | { ok: false; reason: string } {
  const key = raw.trim().toLowerCase();
  if (key === "") {
    if (wasNegative) return { ok: true, value: "expense", inferred: true };
    return { ok: true, value: null, inferred: false };
  }
  const mapped = TYPE_VARIANTS[key];
  if (!mapped) {
    return { ok: false, reason: `Unknown type "${raw.trim()}" — use Income, Expense or Transfer` };
  }
  return { ok: true, value: mapped, inferred: false };
}

/**
 * Validate one already-mapped block of cells. `row` is the 1-based position in
 * the block and is echoed back in every issue so the user can find the row.
 */
export function parseRow(
  cells: Partial<Record<SheetField, string>>,
  row: number,
  context: ParseContext,
): ParsedRow {
  const issues: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const push = (field: RowIssue["field"], reason: string) => issues.push({ row, field, reason });
  const warn = (field: RowIssue["field"], reason: string) => warnings.push({ row, field, reason });

  const rawDate = (cells.date ?? "").trim();
  let date = "";
  if (rawDate === "") {
    push("date", "Date is required");
  } else {
    const parsed = parseDateInput(rawDate, { allowExcelSerial: context.allowExcelSerial });
    if (parsed.ok) date = parsed.value;
    else push("date", parsed.reason);
  }

  const description = (cells.description ?? "").trim();
  if (description === "") push("description", "Description is required");

  let amountMinor = 0;
  let wasNegative = false;
  const rawAmount = (cells.amount ?? "").trim();
  if (rawAmount === "") {
    push("amount", "Amount is required");
  } else {
    const parsed = parseAmountInput(rawAmount);
    if (parsed.ok) {
      amountMinor = parsed.value.minor;
      wasNegative = parsed.value.wasNegative;
    } else {
      push("amount", parsed.reason);
    }
  }

  if (
    amountMinor > 0 &&
    hasFractionDigits(rawAmount) &&
    CURRENCIES[context.currency].decimals === 0
  ) {
    warn(
      "amount",
      `${context.currency} normally has no decimal places — stored as ${(amountMinor / MINOR_SCALE).toFixed(2)}`,
    );
  }

  let type: TxType | null = null;
  let inferredType = false;
  const rawType = (cells.type ?? "").trim();
  const typeResult = parseTypeInput(rawType, wasNegative);
  if (!typeResult.ok) {
    push("type", typeResult.reason);
  } else {
    type = typeResult.value;
    inferredType = typeResult.inferred;
    if (inferredType) warn("type", "Type was inferred as Expense from the negative amount");
  }

  if (wasNegative && type === "income") {
    push("amount", "Amount is negative but Type is Income — set Type to Expense or enter a positive amount");
  }
  if (wasNegative && type === "transfer") {
    push("amount", "Amount is negative but Type is Transfer — enter a positive amount");
  }
  if (wasNegative && type === "expense") {
    warn("amount", "Negative amount stored as a positive Expense");
  }

  const rawAccount = (cells.account ?? "").trim();
  let accountId: string | null = null;
  if (rawAccount === "") {
    if (context.defaultAccountId) accountId = context.defaultAccountId;
    else push("account", "Account is required");
  } else {
    const account = lookupAccount(context.accounts, rawAccount);
    if (!account) push("account", `Unknown account "${rawAccount}"`);
    else accountId = account.id;
  }

  const rawToAccount = (cells.to_account ?? "").trim();
  let toAccountId: string | null = null;
  if (type === "transfer") {
    if (rawToAccount === "") {
      push("to_account", "A transfer needs a destination account");
    } else {
      const destination = lookupAccount(context.accounts, rawToAccount);
      if (!destination) push("to_account", `Unknown account "${rawToAccount}"`);
      else if (accountId && destination.id === accountId) {
        push("to_account", "Source and destination accounts must be different");
      } else toAccountId = destination.id;
    }
  } else if (rawToAccount !== "") {
    push("to_account", "Destination Account is only valid on Transfer rows — clear this cell or set Type to Transfer");
  }

  const rawCategory = (cells.category ?? "").trim();
  let categoryId: string | null = null;
  if (rawCategory !== "") {
    if (type === "transfer") {
      push("category", "Transfers cannot have a category");
    } else {
      const category = lookupCategory(context.categories, rawCategory);
      if (!category) push("category", `Unknown category "${rawCategory}"`);
      else if (type && category.kind !== type) {
        push("category", `Category "${category.name}" is for ${category.kind}, not ${type}`);
      } else categoryId = category.id;
    }
  }

  if (issues.length > 0) return { row, cells, input: null, issues, warnings };

  return {
    row,
    cells,
    input: {
      date,
      description,
      type: type as TxType,
      category_id: categoryId,
      account_id: accountId as string,
      to_account_id: toAccountId,
      amount: amountMinor,
      notes: (cells.notes ?? "").trim(),
    },
    issues,
    warnings,
  };
}

/**
 * Map a whole block. `mapping[i]` is the sheet field that source column `i`
 * feeds, or null when that column is ignored.
 */
export function parseBlock(
  matrix: string[][],
  mapping: (SheetField | null)[],
  context: ParseContext,
): ParsedRow[] {
  return matrix.map((source, index) => {
    const cells: Partial<Record<SheetField, string>> = {};
    source.forEach((raw, columnIndex) => {
      const field = mapping[columnIndex];
      if (!field) return;
      // A block may repeat a column; the last non-empty value wins.
      if (raw.trim() !== "" || cells[field] === undefined) cells[field] = raw;
    });
    return parseRow(cells, index + 1, context);
  });
}