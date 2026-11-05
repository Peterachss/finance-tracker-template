import { minorToDecimalString } from "./money";
import type { Account, Category, Transaction } from "./types";

/**
 * CSV export. Column order matches the spreadsheet so a round trip through
 * this file reproduces the grid.
 */
export const EXPORT_COLUMNS = [
  "id",
  "date",
  "description",
  "type",
  "category",
  "account",
  "to_account",
  "amount",
  "notes",
  "version",
] as const;

/**
 * Spreadsheets execute cell text that starts with `=`, `+`, `-` or `@`.
 * Exported user text is prefixed with an apostrophe so opening the file cannot
 * execute anything. Numeric columns are written as bare digits and are not
 * escaped.
 */
export function escapeCsvCell(value: string): string {
  const needsGuard = /^[=+\-@\t\r]/.test(value);
  const guarded = needsGuard ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

function encodeRow(values: string[]): string {
  return values.map(escapeCsvCell).join(",");
}

export function transactionsToCsv(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
): string {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const lines = [encodeRow([...EXPORT_COLUMNS])];
  for (const tx of transactions) {
    lines.push(
      encodeRow([
        tx.id,
        tx.date,
        tx.description,
        tx.type,
        tx.category_id ? (categoryName.get(tx.category_id) ?? "") : "",
        accountName.get(tx.account_id) ?? "",
        tx.to_account_id ? (accountName.get(tx.to_account_id) ?? "") : "",
        minorToDecimalString(tx.amount),
        tx.notes,
        String(tx.version),
      ]),
    );
  }
  // Trailing newline: some spreadsheet importers drop the final row without it.
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}