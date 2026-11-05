import type { Transaction, TransactionInput } from "./types";

/**
 * Duplicate detection for file/import workflows.
 *
 * A duplicate is only ever REPORTED. Nothing is merged or deleted
 * automatically — the user decides.
 */

export interface DuplicateMatch {
  /** 1-based row number inside the imported block. */
  row: number;
  description: string;
  existing_id: string;
  existing_date: string;
  existing_amount: number;
}

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function key(input: {
  date: string;
  description: string;
  amount: number;
  account_id: string;
  type: string;
}): string {
  return [
    input.date,
    normalise(input.description),
    String(input.amount),
    input.account_id,
    input.type,
  ].join("|");
}

export function findDuplicateCandidates(
  incoming: { row: number; description: string; input: TransactionInput }[],
  existing: Transaction[],
): DuplicateMatch[] {
  const byKey = new Map<string, Transaction>();
  for (const tx of existing) {
    const k = key(tx);
    // Keep the earliest record for a given key so the report is stable.
    if (!byKey.has(k) || tx.created_at < byKey.get(k)!.created_at) byKey.set(k, tx);
  }

  const matches: DuplicateMatch[] = [];
  for (const item of incoming) {
    const found = byKey.get(key(item.input));
    if (!found) continue;
    matches.push({
      row: item.row,
      description: found.description,
      existing_id: found.id,
      existing_date: found.date,
      existing_amount: found.amount,
    });
  }
  return matches;
}