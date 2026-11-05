import { parseRow, type ParseContext, type RowIssue } from "./parse";
import { SHEET_COLUMNS, type SheetField } from "./sheet";
import type { TransactionInput, TransactionUpdate } from "./types";

/**
 * Batch bookkeeping for the spreadsheet.
 *
 * A draft row is a row the user has touched. It is either:
 *   - `saved`   — confirmed identical to the database
 *   - `pending` — valid, waiting to be sent
 *   - `error`   — invalid (issues) or the save failed; never sent
 *   - `conflict`— another device changed the row first; the local edit is kept
 *
 * Nothing is reported as saved until Supabase confirms it.
 */

export type DraftState = "saved" | "pending" | "error" | "conflict";

export interface DraftRow {
  /** null while the row is a new, not-yet-saved record. */
  id: string | null;
  /** Optimistic concurrency token; null for new rows. */
  version: number | null;
  cells: Record<SheetField, string>;
  state: DraftState;
  issues: RowIssue[];
  /** Readable failure text when `state` is error/conflict. */
  error?: string;
}

export function emptyCells(): Record<SheetField, string> {
  return {
    date: "",
    description: "",
    type: "",
    category: "",
    account: "",
    to_account: "",
    amount: "",
    notes: "",
  };
}

export function isBlankDraft(row: DraftRow): boolean {
  return SHEET_COLUMNS.every((field) => row.cells[field].trim() === "");
}

/**
 * Recompute validation for one draft row.
 *
 * A blank row is the "type here" placeholder at the end of the grid. It is not
 * an error and it is not unsaved work, so it must never block a save or light
 * up the dirty indicator.
 */
export function validateDraft(row: DraftRow, context: ParseContext): DraftRow {
  if (isBlankDraft(row)) {
    return { ...row, id: null, version: null, cells: emptyCells(), issues: [], state: "saved" };
  }
  const parsed = parseRow(row.cells, 0, context);
  if (!parsed.input) {
    return { ...row, issues: parsed.issues, state: "error", error: undefined };
  }
  return { ...row, issues: parsed.warnings, state: "pending", error: undefined };
}

export interface PartitionedBatch {
  creates: TransactionInput[];
  updates: TransactionUpdate[];
  /** Draft rows that must not be sent because they are invalid or conflicted. */
  invalid: DraftRow[];
  /**
   * False when any row is invalid. The payload is then empty on purpose:
   * a batch is all-or-nothing, so the caller must resolve the bad rows (or
   * explicitly opt into excluding them) before anything is written.
   */
  canCommit: boolean;
}

/**
 * Split pending drafts into the creates/updates payload sent to the
 * transactional RPC. A draft only reaches the payload when it validated.
 *
 * By default one bad row blocks the entire batch. Passing
 * `excludeInvalid` is the deliberate, user-confirmed choice to drop those
 * rows and commit the rest; the caller must state which rows are dropped.
 */
export function partitionBatch(
  rows: DraftRow[],
  context: ParseContext,
  options: { excludeInvalid?: boolean } = {},
): PartitionedBatch {
  const creates: TransactionInput[] = [];
  const updates: TransactionUpdate[] = [];
  const invalid: DraftRow[] = [];

  for (const row of rows) {
    // The trailing blank placeholder is never sent.
    if (isBlankDraft(row)) continue;
    if (row.state === "error" || row.state === "conflict") {
      invalid.push(row);
      continue;
    }
    if (row.state !== "pending") continue;

    const parsed = parseRow(row.cells, 0, context);
    if (!parsed.input) {
      invalid.push({ ...row, state: "error" });
      continue;
    }
    if (row.id === null) creates.push(parsed.input);
    else updates.push({ ...parsed.input, id: row.id, version: row.version ?? 1 });
  }

  const canCommit = invalid.length === 0 || options.excludeInvalid === true;
  return {
    creates: canCommit ? creates : [],
    updates: canCommit ? updates : [],
    invalid,
    canCommit,
  };
}

export function hasUnsavedChanges(rows: DraftRow[]): boolean {
  return rows.some(
    (row) =>
      !isBlankDraft(row) &&
      (row.state === "pending" || row.state === "error" || row.state === "conflict"),
  );
}

/**
 * Parse a database error raised by `apply_transaction_batch`.
 * The RPC aborts the whole transaction when any row conflicts, so a reported
 * conflict always means nothing was written.
 */
export interface BatchFailure {
  message: string;
  conflicts: string[];
  aborted: true;
}

export const CONFLICT_PREFIX = "FINANCE_CONFLICT:";

export function describeBatchFailure(error: unknown): BatchFailure {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? "Save failed";

  const index = message.indexOf(CONFLICT_PREFIX);
  if (index === -1) {
    return { message: message || "Save failed", conflicts: [], aborted: true };
  }

  const ids = message.slice(index + CONFLICT_PREFIX.length).split(/\s/)[0].split(",").filter(Boolean);
  return {
    message: `Another device changed ${ids.length} row${ids.length === 1 ? "" : "s"} first. Nothing was saved — reload to see the newer values.`,
    conflicts: ids,
    aborted: true,
  };
}