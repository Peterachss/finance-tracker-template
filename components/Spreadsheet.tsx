"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImportPreview } from "@/components/ImportPreview";
import { IMPORT_KEY, ImportButton } from "@/components/ImportButton";
import { Banner, Button, ConfirmDialog, EmptyState, Input, Modal, Select } from "@/components/ui";
import {
  describeBatchFailure,
  emptyCells,
  hasUnsavedChanges,
  isBlankDraft,
  partitionBatch,
  validateDraft,
  type DraftRow,
  type DraftState,
} from "@/lib/batch";
import { downloadCsv, transactionsToCsv } from "@/lib/csv";
import { todayIso } from "@/lib/dates";
import { formatMinor, minorToDecimalString } from "@/lib/money";
import { parseAmountInput, type ParseContext } from "@/lib/parse";
import {
  detectDelimiter,
  normalizeMatrix,
  parseDelimited,
  planPaste,
  SHEET_COLUMNS,
  SHEET_COLUMN_WIDTH,
  SHEET_HEADERS,
  toTsv,
  type SheetField,
} from "@/lib/sheet";
import { activeCategories, useWorkspace } from "@/lib/store";
import type { CurrencyCode, Transaction } from "@/lib/types";

/** Lossless, locale-neutral cell text so a value survives an edit round trip. */
function amountCell(minor: number): string {
  const text = minorToDecimalString(minor);
  return text.endsWith(".00") ? text.slice(0, -3) : text;
}

function toDraft(tx: Transaction, accounts: { id: string; name: string }[], categories: { id: string; name: string }[]): DraftRow {
  return {
    id: tx.id,
    version: tx.version,
    cells: {
      date: tx.date,
      description: tx.description,
      type: tx.type,
      category: tx.category_id ? (categories.find((c) => c.id === tx.category_id)?.name ?? "") : "",
      account: accounts.find((a) => a.id === tx.account_id)?.name ?? "",
      to_account: tx.to_account_id ? (accounts.find((a) => a.id === tx.to_account_id)?.name ?? "") : "",
      amount: amountCell(tx.amount),
      notes: tx.notes,
    },
    state: "saved" as DraftState,
    issues: [],
  };
}

/** Google Sheets "light 2" fills, one per column, as in the Expense tracker. */
const HEADER_FILLS = ["#f3f3f3", "#f4cccc", "#f9cb9c", "#ffe599", "#b6d7a8", "#a2c4c9", "#ea9999", "#d9d9d9"];

function buildDrafts(
  list: Transaction[],
  accounts: { id: string; name: string }[],
  categories: { id: string; name: string }[],
): DraftRow[] {
  const drafts = list.map((tx) => toDraft(tx, accounts, categories));
  // Always keep a blank row at the end so there is always somewhere to type.
  return drafts.length === 0 ? [{ ...TEMPLATE_ROW }] : drafts;
}

const TEMPLATE_ROW: DraftRow = { id: null, version: null, cells: emptyCells(), state: "pending", issues: [] };

type SortKey = "date" | "amount" | "description";
type SortDirection = "asc" | "desc";

export function Spreadsheet() {
  const { transactions, accounts, categories, currency, commitBatch, removeTransactions, state: loadState, error: loadError } = useWorkspace();

  // Start from the records already loaded: this tab often mounts after the
  // data arrives, and waiting for a change would show an empty sheet.
  const [rows, setRows] = useState<DraftRow[]>(() => buildDrafts(transactions, accounts, categories));
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(null);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [importMatrix, setImportMatrix] = useState<string[][] | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirm, setConfirm] = useState<null | { title: string; message: string; action: () => void; label: string }>(null);
  const [history, setHistory] = useState<DraftRow[][]>([]);
  const [showAll, setShowAll] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // "Edit" links from the dashboard arrive as /spreadsheet?q=<description>.
  // Read after mount so the prerendered markup and first client render agree.
  useEffect(() => {
    const timer = setTimeout(() => {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setSearch(q);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const accountsForEdit = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const categoriesForEdit = useMemo(() => activeCategories(categories), [categories]);

  const parseContext = useMemo<ParseContext>(
    () => ({ accounts, categories, currency }),
    [accounts, categories, currency],
  );

  /**
   * Rebuild the drafts when the database delivers a new set of records.
   * This follows React's "adjust state when an input changes" pattern rather
   * than an effect, and never overwrites edits the user has not saved.
   */
  const [serverData, setServerData] = useState({ transactions, accounts, categories });
  const serverChanged =
    serverData.transactions !== transactions ||
    serverData.accounts !== accounts ||
    serverData.categories !== categories;

  const dirty = useMemo(() => hasUnsavedChanges(rows), [rows]);

  if (serverChanged) {
    setServerData({ transactions, accounts, categories });
    if (!dirty) setRows(buildDrafts(transactions, accounts, categories));
  }

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges(rows)) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [rows]);

  const snapshot = useCallback(() => {
    setHistory((stack) => [...stack.slice(-19), rows.map((row) => ({ ...row, cells: { ...row.cells } }))]);
  }, [rows]);

  const undo = useCallback(() => {
    setHistory((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setRows(previous);
      return stack.slice(0, -1);
    });
  }, []);

  /** Replace a cell's text and revalidate that row. */
  const setCell = useCallback(
    (rowIndex: number, field: SheetField, value: string, options: { record?: boolean } = {}) => {
      if (options.record) snapshot();
      setRows((current) => {
        const next = [...current];
        while (next.length <= rowIndex) next.push({ ...TEMPLATE_ROW, cells: emptyCells() });
        const row = { ...next[rowIndex], cells: { ...next[rowIndex].cells, [field]: value } };
        next[rowIndex] = validateDraft(row, parseContext);
        return next;
      });
      setSaveError(null);
    },
    [parseContext, snapshot],
  );

  // ------------------------------------------------------------ filtering
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const indexes = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (isBlankDraft(row) && row.id === null) return false;
        if (typeFilter && row.cells.type.trim().toLowerCase() !== typeFilter) return false;
        if (categoryFilter && (row.cells.category.trim().toLowerCase() !== categoryFilter)) return false;
        if (accountFilter) {
          const account = row.cells.account.trim().toLowerCase();
          const toAccount = row.cells.to_account.trim().toLowerCase();
          if (account !== accountFilter && toAccount !== accountFilter) return false;
        }
        const date = row.cells.date.trim();
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        if (needle) {
          const haystack = SHEET_COLUMNS.map((field) => row.cells[field]).join(" ").toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const left = a.row.cells[sortKey] || a.row.cells.date;
        const right = b.row.cells[sortKey] || b.row.cells.date;
        const comparison =
          sortKey === "amount"
            ? Number(left.replace(/[^\d.-]/g, "")) - Number(right.replace(/[^\d.-]/g, ""))
            : left.localeCompare(right);
        return sortDirection === "asc" ? comparison : -comparison;
      });
    return indexes.map((entry) => entry.index);
  }, [rows, search, typeFilter, categoryFilter, accountFilter, fromDate, toDate, sortKey, sortDirection]);

  /** Totals of the rows currently shown (respects every filter). */
  const totals = useMemo(() => {
    let spent = 0;
    let income = 0;
    for (const index of visible) {
      const cells = rows[index].cells;
      const parsed = parseAmountInput(cells.amount);
      if (!parsed.ok) continue;
      const type = cells.type.trim().toLowerCase();
      if (type === "expense") spent += parsed.value.minor;
      else if (type === "income") income += parsed.value.minor;
    }
    return { spent, income };
  }, [visible, rows]);

  const RENDER_LIMIT = 300;
  const rendered = showAll ? visible : visible.slice(0, RENDER_LIMIT);

  // ------------------------------------------------------------ selection
  const selectionRange = useMemo(() => {
    if (!active) return null;
    const end = focus ?? active;
    return {
      top: Math.min(active.row, end.row),
      bottom: Math.max(active.row, end.row),
      left: Math.min(active.col, end.col),
      right: Math.max(active.col, end.col),
    };
  }, [active, focus]);

  const moveTo = useCallback(
    (row: number, col: number, extend: boolean) => {
      const bounded = {
        row: Math.max(0, Math.min(row, rows.length - 1)),
        col: Math.max(0, Math.min(col, SHEET_COLUMNS.length - 1)),
      };
      setActive(bounded);
      if (extend && anchor) setFocus(bounded);
      else {
        setAnchor(bounded);
        setFocus(bounded);
      }
    },
    [rows.length, anchor],
  );

  const isSelected = useCallback(
    (row: number, col: number) => {
      if (!selectionRange) return false;
      return (
        row >= selectionRange.top &&
        row <= selectionRange.bottom &&
        col >= selectionRange.left &&
        col <= selectionRange.right
      );
    },
    [selectionRange],
  );

  // ------------------------------------------------------------ clipboard
  const handleCopy = useCallback(
    (event: React.ClipboardEvent) => {
      if (!selectionRange || !rows.length) return;
      const matrix: string[][] = [];
      for (let row = selectionRange.top; row <= selectionRange.bottom; row += 1) {
        const line: string[] = [];
        for (let col = selectionRange.left; col <= selectionRange.right; col += 1) {
          line.push(rows[row]?.cells[SHEET_COLUMNS[col]] ?? "");
        }
        matrix.push(line);
      }
      event.clipboardData.setData("text/plain", toTsv(matrix));
      event.preventDefault();
    },
    [selectionRange, rows],
  );

  const applyPaste = useCallback(
    (text: string) => {
      const matrix = normalizeMatrix(parseDelimited(text, detectDelimiter(text)));
      if (matrix.length === 0) return;

      // A header-looking first row over several rows goes through the preview.
      const header = matrix[0].map((cell) => cell.toLowerCase().trim());
      const looksLikeHeader =
        matrix.length > 1 && header.some((cell) => cell === "date" || cell === "description" || cell === "amount");

      if (looksLikeHeader) {
        setImportMatrix(matrix);
        return;
      }

      const anchorRow = active?.row ?? 0;
      const anchorCol = active?.col ?? 0;
      const plan = planPaste({ matrix, anchorRow, anchorCol, rowCount: rows.length });

      const commit = () => {
        snapshot();
        setRows((current) => {
          const next = [...current];
          for (const target of plan.targets) {
            while (next.length <= target.row) next.push({ ...TEMPLATE_ROW, cells: emptyCells() });
            const row = { ...next[target.row], cells: { ...next[target.row].cells, [target.field]: target.raw } };
            next[target.row] = validateDraft(row, parseContext);
          }
          return next;
        });
        setSaveError(null);
        moveTo(anchorRow, anchorCol, false);
      };

      // A large overlap with existing records is worth one confirmation.
      if (plan.editedRows.length > 10) {
        setConfirm({
          title: "Overwrite existing rows?",
          message: `This paste writes over ${plan.editedRows.length} saved records${
            plan.newRows.length ? ` and adds ${plan.newRows.length} new one${plan.newRows.length === 1 ? "" : "s"}` : ""
          }. You can undo once afterwards.`,
          label: `Overwrite ${plan.editedRows.length} rows`,
          action: commit,
        });
        return;
      }
      commit();
    },
    [active, rows.length, parseContext, snapshot, moveTo],
  );

  /**
 * "Import / paste" works everywhere, including a phone where there is no
 * Ctrl+V into a grid. Try the clipboard directly first; if the browser denies
 * permission, fall back to a textarea the user can paste into by hand.
 */
const applyPasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        applyPaste(text);
        return;
      }
    } catch {
      // Permission denied or unsupported: fall through to the manual box.
    }
    setPasteText("");
    setPasteOpen(true);
  }, [applyPaste]);

  // A file picked with Import on the dashboard waits in session storage.
  const imported = useRef(false);
  useEffect(() => {
    if (imported.current || loadState !== "ready") return;
    imported.current = true;
    let text: string | null = null;
    try {
      text = sessionStorage.getItem(IMPORT_KEY);
      sessionStorage.removeItem(IMPORT_KEY);
    } catch {
      // Storage blocked: nothing was handed over.
    }
    if (!text) return;
    const timer = setTimeout(() => applyPaste(text), 0);
    return () => clearTimeout(timer);
  }, [loadState, applyPaste]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const text = event.clipboardData.getData("text/plain");
      if (!text) return;
      event.preventDefault();
      applyPaste(text);
    },
    [applyPaste],
  );

  const clearSelection = useCallback(() => {
    if (!selectionRange) return;
    snapshot();
    setRows((current) => {
      const next = current.map((row, index) => {
        if (index < selectionRange.top || index > selectionRange.bottom) return row;
        const cells = { ...row.cells };
        for (let col = selectionRange.left; col <= selectionRange.right; col += 1) {
          cells[SHEET_COLUMNS[col]] = "";
        }
        return validateDraft({ ...row, cells }, parseContext);
      });
      return next;
    });
  }, [selectionRange, parseContext, snapshot]);

  const deleteSelectedRows = useCallback(() => {
    if (!selectionRange) return;
    const indexes: string[] = [];
    for (let row = selectionRange.top; row <= selectionRange.bottom; row += 1) {
      if (rows[row]?.id) indexes.push(rows[row].id as string);
    }
    const localCount = selectionRange.bottom - selectionRange.top + 1 - indexes.length;
    const doDelete = async () => {
      try {
        if (indexes.length) await removeTransactions(indexes);
        if (localCount > 0) {
          snapshot();
          setRows((current) =>
            current.filter((_, index) => index < selectionRange.top || index > selectionRange.bottom),
          );
        }
      } catch (cause) {
        setSaveError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    setConfirm({
      title: indexes.length ? `Delete ${indexes.length} saved record${indexes.length === 1 ? "" : "s"}?` : "Delete these rows?",
      message: "Deleted records cannot be recovered from the app.",
      label: "Delete",
      action: () => void doDelete(),
    });
  }, [selectionRange, rows, removeTransactions, snapshot]);

  // ------------------------------------------------------------ saving
  /**
   * Send a set of drafts as one atomic batch. On success the grid is rebuilt
   * from what the database actually stored; on failure the drafts stay exactly
   * as the user left them so nothing is lost.
   */
  const commitDrafts = useCallback(
    async (drafts: DraftRow[], options: { excludeInvalid?: boolean } = {}) => {
      const batch = partitionBatch(drafts, parseContext, options);
      if (!batch.canCommit) {
        setSaveError(
          `${batch.invalid.length} row${batch.invalid.length === 1 ? "" : "s"} cannot be saved yet. Fix the highlighted cells, or exclude them explicitly.`,
        );
        return;
      }
      if (batch.creates.length === 0 && batch.updates.length === 0) return;

      // Fingerprint of every row this save covers. Anything still pending after
      // the response that does NOT match one of these was edited mid-flight and
      // must be carried over rather than overwritten.
      const sent = new Set(drafts.map((row) => JSON.stringify(row.cells)));

      setSaving(true);
      setSaveError(null);
      setConflictMessage(null);
      try {
        const { loaded } = await commitBatch(batch.creates, batch.updates);

        if (loaded) {
          /**
           * Rebuild from the server, then carry over anything the user changed
           * while the request was in flight. Rebuilding unconditionally would
           * silently discard a keystroke typed during the round trip.
           */
          setRows((current) => {
            const base = buildDrafts(loaded.transactions, loaded.accounts, loaded.categories);
            for (const row of current) {
              if (row.state !== "pending") continue;
              if (sent.has(JSON.stringify(row.cells))) continue;

              if (row.id) {
                const target = base.findIndex((candidate) => candidate.id === row.id);
                if (target >= 0) {
                  // Keep the newer text but adopt the server's version, so the
                  // next save does not raise a false conflict.
                  base[target] = { ...base[target], cells: row.cells, state: "pending" };
                  continue;
                }
              }
              base.push(row); // created after this save began; has no server id yet
            }
            return base;
          });
        }
        setHistory([]);
      } catch (cause) {
        const failure = describeBatchFailure(cause);
        if (failure.conflicts.length > 0) {
          setConflictMessage(failure.message);
          const conflicted = new Set(failure.conflicts);
          // Keep the local edits and flag exactly the rows that lost the race.
          setRows((current) =>
            current.map((row) => {
              if (row.id && conflicted.has(row.id)) {
                return { ...row, state: "conflict", error: failure.message };
              }
              return row.state === "pending"
                ? { ...row, state: "error", error: failure.message }
                : row;
            }),
          );
        } else {
          setSaveError(failure.message);
        }
      } finally {
        setSaving(false);
      }
    },
    [parseContext, commitBatch],
  );

  const save = useCallback(
    (options: { excludeInvalid?: boolean } = {}) => commitDrafts(rows, options),
    [commitDrafts, rows],
  );

  // Autosave plain edits, but never while something is invalid.
  useEffect(() => {
    if (loadState !== "ready") return;
    const invalid = rows.some((row) => row.state === "error" || row.state === "conflict");
    if (!hasUnsavedChanges(rows) || invalid) return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [rows, save, loadState]);

  // ------------------------------------------------------------ status
  const status = (() => {
    if (loadState === "loading") return { tone: "info" as const, text: "Loading saved records…" };
    if (rows.some((row) => row.state === "conflict")) return { tone: "error" as const, text: "Conflict detected" };
    if (saving) return { tone: "info" as const, text: "Saving…" };
    if (rows.some((row) => row.state === "error")) return { tone: "error" as const, text: "Unsaved changes — fix the highlighted rows" };
    if (dirty) return { tone: "warning" as const, text: "Unsaved changes" };
    return { tone: "success" as const, text: "Saved" };
  })();

  const invalidRows = rows.filter((row) => row.state === "error" && row.issues.length > 0);
  const typeOptions = ["income", "expense", "transfer"];

  if (loadState === "error") {
    return <Banner tone="error" title="Could not load records:">{loadError}</Banner>;
  }

  const addRow = () => {
    const blank: DraftRow = { ...TEMPLATE_ROW, cells: { ...emptyCells(), date: todayIso() } };
    snapshot();
    setRows((current) => [...current, validateDraft(blank, parseContext)]);
  };

  /** A filter is "active" when it narrows the view; shown so it is never a mystery. */
  const activeFilterCount =
    (search ? 1 : 0) + (typeFilter ? 1 : 0) + (categoryFilter ? 1 : 0) + (accountFilter ? 1 : 0) + (fromDate || toDate ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setCategoryFilter("");
    setAccountFilter("");
    setFromDate("");
    setToDate("");
  };

  const statusDot = {
    info: "bg-[var(--text-faint)]",
    warning: "bg-[var(--warning)]",
    error: "bg-[var(--negative)]",
    success: "bg-[var(--accent)]",
  }[status.tone];

  const statusText = {
    info: "text-[var(--text-muted)]",
    warning: "text-[var(--warning)]",
    error: "text-[var(--negative)] font-medium",
    success: "text-[var(--text-muted)]",
  }[status.tone];

  return (
    <div className="flex flex-col gap-3">
      {/*
        Toolbar in three groups, divided by vertical rules so the eye can find
        a function without scanning a row of identical buttons:
          search + filters | row and import actions | save, history, export
        Save sits next to the save state; destructive actions are last.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Group 1 — find */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search transactions"
            className={`min-h-9 !w-44 ${search ? "border-[var(--accent)]" : ""}`}
          />
          <Select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filter by type"
            className={`min-h-9 !w-32 ${typeFilter ? "border-[var(--accent)]" : ""}`}
          >
            <option value="">All types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>
          {activeFilterCount > 0 ? (
            <button onClick={clearFilters} className="text-xs text-[var(--accent)] underline-offset-2 hover:underline">
              Clear {activeFilterCount}
            </button>
          ) : null}
        </div>

        <span className="hidden h-6 w-px bg-[var(--line)] lg:block" />

        {/* Group 2 — rows and import */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={addRow}>Add row</Button>
          <ImportButton
            onText={applyPaste}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 text-[13px] text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
          />
          <Button size="sm" onClick={applyPasteFromClipboard}>Paste</Button>
        </div>

        <span className="hidden h-6 w-px bg-[var(--line)] lg:block" />

        {/* Group 3 — save state, save, history, export, destructive */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5" role="status" aria-live="polite">
            <span className={`size-1.5 rounded-full ${statusDot} ${saving ? "animate-pulse" : ""}`} />
            <span className={`text-xs ${statusText}`}>{status.text}</span>
          </span>
          <Button size="sm" variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            Save
          </Button>
          <Button size="sm" variant="ghost" disabled={history.length === 0} onClick={undo}>
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadCsv(`transactions-${todayIso()}.csv`, transactionsToCsv(transactions, categories, accounts))}
          >
            Export
          </Button>
          <Button size="sm" variant="danger" onClick={deleteSelectedRows}>
            Delete
          </Button>
        </div>
      </div>

      {saveError ? (
        <Banner tone="error" title="Save failed:" action={<Button size="sm" onClick={() => void save()}>Retry</Button>}>
          {saveError}{" "}
          {invalidRows.length > 0 ? (
            <button
              className="underline"
              onClick={() =>
                setConfirm({
                  title: "Save the valid rows only?",
                  message: `These rows will not be saved: ${invalidRows.length} invalid row(s). Everything else is written in one batch.`,
                  label: "Save valid rows",
                  action: () => void save({ excludeInvalid: true }),
                })
              }
            >
              Save the valid rows only
            </button>
          ) : null}
        </Banner>
      ) : null}

      {conflictMessage ? (
        <Banner tone="error" title="Conflict:" action={<Button size="sm" onClick={() => window.location.reload()}>Reload</Button>}>
          {conflictMessage} Your edits are still shown below. Reload to see the newer values, then decide what to keep.
        </Banner>
      ) : null}

      {invalidRows.length > 0 ? (
        <Banner tone="warning" title={`${invalidRows.length} row(s) need attention:`}>
          <ul className="list-disc pl-4">
            {invalidRows.slice(0, 6).flatMap((row) =>
              row.issues.map((issue) => (
                <li key={`${row.id ?? "new"}-${issue.field}-${issue.reason}`}>
                  Row {rows.indexOf(row) + 1} · {SHEET_HEADERS[issue.field as SheetField] ?? "row"}: {issue.reason}
                </li>
              )),
            )}
          </ul>
        </Banner>
      ) : null}

      {/*
        Remaining filters. Search and type now live in the toolbar; this row
        holds the ones that are used occasionally, plus sort and row count.
        An active filter is tinted so "nothing matches" is distinguishable from
        "you are looking at a subset".
      */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Filter by category"
          className={`min-h-9 !w-40 ${categoryFilter ? "border-[var(--accent)]" : ""}`}
        >
          <option value="">All categories</option>
          {categoriesForEdit.map((category) => (
            <option key={category.id} value={category.name.toLowerCase()}>{category.name}</option>
          ))}
        </Select>
        <Select
          value={accountFilter}
          onChange={(event) => setAccountFilter(event.target.value)}
          aria-label="Filter by account"
          className={`min-h-9 !w-40 ${accountFilter ? "border-[var(--accent)]" : ""}`}
        >
          <option value="">All accounts</option>
          {accountsForEdit.map((account) => (
            <option key={account.id} value={account.name.toLowerCase()}>{account.name}</option>
          ))}
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          aria-label="From date"
          className={`min-h-9 !w-36 ${fromDate ? "border-[var(--accent)]" : ""}`}
        />
        <Input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          aria-label="To date"
          className={`min-h-9 !w-36 ${toDate ? "border-[var(--accent)]" : ""}`}
        />

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="sheet-sort" className="text-xs text-[var(--text-muted)]">Sort</label>
          <Select
            id="sheet-sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="min-h-9 !w-auto"
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="description">Description</option>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setSortDirection((value) => (value === "asc" ? "desc" : "asc"))}>
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </Button>
          <p className="text-xs text-[var(--text-muted)]">
            <span className="tnum font-medium text-[var(--text)]">{visible.length}</span> rows
          </p>
        </div>
      </div>

      {/* The grid is the point of this page: it takes the remaining height and
          the full width, and scrolls inside its own box only. */}
      <div
        className="overflow-auto rounded-[12px] border border-[var(--sheet-grid)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
        style={{ maxHeight: "calc(100dvh - 240px)" }}
      >
        <div
          role="grid"
          tabIndex={0}
          aria-label="Transactions"
          aria-rowcount={visible.length}
          className="min-w-max outline-none"
          onKeyDown={(event) => {
            if (editing || !active) return;
            const { row, col } = active;
            if (event.key === "ArrowDown") { event.preventDefault(); moveTo(row + 1, col, event.shiftKey); }
            else if (event.key === "ArrowUp") { event.preventDefault(); moveTo(row - 1, col, event.shiftKey); }
            else if (event.key === "ArrowLeft") { event.preventDefault(); moveTo(row, col - 1, event.shiftKey); }
            else if (event.key === "ArrowRight") { event.preventDefault(); moveTo(row, col + 1, event.shiftKey); }
            else if (event.key === "Tab") { event.preventDefault(); moveTo(event.shiftKey ? row : row + 1, event.shiftKey ? col - 1 : col + 1, false); }
            else if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); setEditing({ row, col }); }
            else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); clearSelection(); }
            else if (event.key === "Escape") { setActive(null); setAnchor(null); setFocus(null); }
            else if (event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); undo(); }
            else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
              event.preventDefault();
              const column = SHEET_COLUMNS[col];
              setCell(row, column, event.key, { record: true });
              setEditing({ row, col });
            }
          }}
          onCopy={handleCopy}
          onPaste={handlePaste}
        >
          {/* Frozen header, Google Sheets style: column letters, then the field row. */}
          <div className="sticky top-0 z-20">
            <div aria-hidden="true" className="flex bg-[var(--sheet-head)] text-[11px] text-[var(--text-muted)]">
              <div className="h-6 w-[46px] shrink-0 border-b border-r border-[var(--sheet-grid)]" />
              {SHEET_COLUMNS.map((field, col) => (
                <div
                  key={field}
                  style={{ width: SHEET_COLUMN_WIDTH[field] }}
                  className={`grid h-6 shrink-0 place-items-center border-b border-r border-[var(--sheet-grid)] ${
                    active?.col === col ? "bg-[var(--sheet-select-soft)] font-semibold text-[var(--sheet-select)]" : ""
                  }`}
                >
                  {String.fromCharCode(65 + col)}
                </div>
              ))}
            </div>
            <div role="row" className="flex text-[12px] font-semibold text-[#111816]">
              <div aria-hidden="true" className="w-[46px] shrink-0 border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)]" />
              {SHEET_COLUMNS.map((field, col) => (
                <div
                  key={field}
                  role="columnheader"
                  style={{ width: SHEET_COLUMN_WIDTH[field], background: HEADER_FILLS[col % HEADER_FILLS.length] }}
                  className={`flex h-9 shrink-0 items-center border-b border-r border-[var(--sheet-grid)] px-3 ${field === "amount" ? "justify-end" : ""}`}
                >
                  {SHEET_HEADERS[field]}
                </div>
              ))}
            </div>
          </div>

          {rendered.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No transactions yet">
                Add a row, or paste a block copied from a spreadsheet.
              </EmptyState>
            </div>
          ) : null}

          {rendered.map((rowIndex) => {
            const row = rows[rowIndex];
            const isLastBlank = rowIndex === rows.length - 1 && row.id === null;
            return (
              <div
                key={rowIndex}
                role="row"
                aria-rowindex={rowIndex + 1}
                onMouseDown={(event) => {
                  const cell = (event.target as HTMLElement).closest("[data-col]");
                  if (!cell) return;
                  const col = Number((cell as HTMLElement).dataset.col);
                  moveTo(rowIndex, col, event.shiftKey);
                }}
                onMouseEnter={(event) => {
                  if (event.buttons === 1 && active) {
                    const cell = (event.target as HTMLElement).closest("[data-col]");
                    if (!cell) return;
                    moveTo(rowIndex, Number((cell as HTMLElement).dataset.col), true);
                  }
                }}
                /**
                 * Row treatment in priority order: an invalid or conflicted row
                 * must never read as a normal one, so its state wins over the
                 * alternating tint and over hover.
                 */
                className={`flex text-[13px] ${
                  row.state === "error"
                    ? "bg-[var(--danger-soft)]"
                    : row.state === "conflict"
                      ? "bg-[var(--warning-soft)]"
                      : visible.indexOf(rowIndex) % 2 === 1
                        ? "bg-[var(--sheet-band)]"
                        : "bg-[var(--surface)]"
                } ${isLastBlank ? "opacity-60" : ""}`}
              >
                {/* Row number gutter, highlighted for the active row like Sheets. */}
                <div
                  aria-hidden="true"
                  className={`grid w-[46px] shrink-0 place-items-center border-b border-r border-[var(--sheet-grid)] text-[11px] ${
                    active?.row === rowIndex
                      ? "bg-[var(--sheet-select-soft)] font-semibold text-[var(--sheet-select)]"
                      : "bg-[var(--sheet-head)] text-[var(--text-muted)]"
                  }`}
                >
                  {visible.indexOf(rowIndex) + 1}
                </div>
                {SHEET_COLUMNS.map((field, col) => {
                  const isActiveCell = active?.row === rowIndex && active.col === col;
                  const isEditing = editing?.row === rowIndex && editing.col === col;
                  const badField = row.state === "error" && row.issues.some((issue) => issue.field === field);
                  return (
                    <div
                      key={field}
                      role="gridcell"
                      data-col={col}
                      aria-selected={isSelected(rowIndex, col)}
                      aria-invalid={badField || undefined}
                      title={badField ? row.issues.find((issue) => issue.field === field)?.reason : undefined}
                      style={{ width: SHEET_COLUMN_WIDTH[field] }}
                      className={`relative h-8 shrink-0 truncate border-b border-r border-[var(--sheet-grid)] px-3 leading-8 ${
                        field === "amount" ? "tnum text-right" : ""
                      } ${
                        isSelected(rowIndex, col) ? "bg-[var(--sheet-select-soft)]" : ""
                      } ${isActiveCell ? "z-10 outline-2 -outline-offset-2 outline-[var(--sheet-select)]" : ""}`}
                    >
                      {/* An invalid cell gets a marker, not only a colour. */}
                      {badField ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--negative)]"
                        />
                      ) : null}
                      {isEditing ? (
                        <CellEditor
                          field={field}
                          value={row.cells[field]}
                          accounts={accountsForEdit}
                          categories={categoriesForEdit}
                          onChange={(value) => setCell(rowIndex, field, value)}
                          onCommit={() => {
                            setEditing(null);
                            moveTo(rowIndex + 1, col, false);
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : field === "amount" && !isBlankDraft(row) ? (
                        displayAmount(row.cells.amount, currency)
                      ) : (
                        row.cells[field]
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {visible.length > 0 ? (
            <div className="flex text-[13px] font-semibold">
              <div aria-hidden="true" className="w-[46px] shrink-0 border-b border-r border-[var(--sheet-grid)] bg-[var(--sheet-head)]" />
              {SHEET_COLUMNS.map((field) => (
                <div
                  key={field}
                  style={{ width: SHEET_COLUMN_WIDTH[field] }}
                  className={`flex h-8 shrink-0 items-center border-b border-r border-[var(--sheet-grid)] bg-[var(--surface-sunken)] px-3 ${field === "amount" ? "tnum justify-end" : ""}`}
                >
                  {field === "date" ? "Total" : field === "description" ? `${visible.length} record${visible.length === 1 ? "" : "s"}` : field === "amount" ? (
                    <span className="flex flex-col items-end leading-tight">
                      <span>{formatMinor(totals.spent, currency, { symbol: true })} out</span>
                      {totals.income ? <span className="text-[11px] font-medium text-[var(--positive)]">{formatMinor(totals.income, currency, { symbol: true })} in</span> : null}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {visible.length > RENDER_LIMIT && !showAll ? (
        <Button size="sm" onClick={() => setShowAll(true)}>
          Show all {visible.length} rows
        </Button>
      ) : null}

      {/* Fallback paste box: works on a phone and wherever the browser blocks
          programmatic clipboard reads. */}
      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="Paste from your clipboard"
        footer={
          <>
            <Button onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={pasteText.trim() === ""}
              onClick={() => {
                setPasteOpen(false);
                applyPaste(pasteText);
              }}
            >
              Continue
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-[var(--text-muted)]">
          Copy a block in Google Sheets or Excel, then paste it below with Ctrl+V (Cmd+V on a Mac). Tabs separate
          columns and newlines separate rows.
        </p>
        <textarea
          autoFocus
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          rows={8}
          aria-label="Clipboard contents"
          placeholder={"2026-03-01\tLunch\tExpense\tFood\tCash\t85000"}
          className="tnum w-full resize-y rounded-[8px] border border-[var(--line-strong)] bg-[var(--background)] p-3 font-mono text-xs text-[var(--text)]"
        />
      </Modal>

      {importMatrix ? (
        <ImportPreview
          matrix={importMatrix}
          context={parseContext}
          currency={currency}
          existing={transactions}
          onCancel={() => setImportMatrix(null)}
          onCommit={(parsedRows) => {
            setImportMatrix(null);
            snapshot();
            const drafts = parsedRows.map((parsed) =>
              validateDraft(
                {
                  id: null,
                  version: null,
                  cells: {
                    date: parsed.cells.date ?? "",
                    description: parsed.cells.description ?? "",
                    type: parsed.cells.type ?? "",
                    category: parsed.cells.category ?? "",
                    account: parsed.cells.account ?? "",
                    to_account: parsed.cells.to_account ?? "",
                    amount: parsed.cells.amount ?? "",
                    notes: parsed.cells.notes ?? "",
                  },
                  state: "pending",
                  issues: [],
                },
                parseContext,
              ),
            );
            setRows((current) => [
              ...current.filter((row) => !(row.id === null && isBlankDraft(row))),
              ...drafts,
            ]);
            // Commit exactly these drafts, not the rows the closure captured.
            void commitDrafts(drafts);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        confirmLabel={confirm?.label ?? "Confirm"}
        message={confirm?.message ?? ""}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action();
          setConfirm(null);
        }}
      />

      <MobileSheet
        rows={visible}
        allRows={rows}
        accounts={accountsForEdit}
        categories={categoriesForEdit}
        currency={currency}
        context={parseContext}
        onChange={setCell}
        onDelete={deleteSelectedRows}
        onAdd={() => {
          const blank: DraftRow = { ...TEMPLATE_ROW, cells: { ...emptyCells(), date: todayIso() } };
          snapshot();
          setRows((current) => [...current, validateDraft(blank, parseContext)]);
        }}
      />
    </div>
  );
}

/**
 * Render a cell's amount for display.
 *
 * This MUST use the same parser as saving, or the grid would show a different
 * number from the one that gets stored. The previous implementation stripped
 * separators naively, so "85.000" (standard VND grouping) displayed as 85.
 */
function displayAmount(raw: string, currency: CurrencyCode): string {
  const parsed = parseAmountInput(raw);
  if (!parsed.ok) return raw;
  return formatMinor(parsed.value.minor, currency);
}

function CellEditor({ field, value, accounts, categories, onChange, onCommit, onCancel }: {
  field: SheetField;
  value: string;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: string }[];
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputType = field === "date" ? "date" : field === "amount" ? "text" : "text";

  if (field === "type") {
    return (
      <select
        autoFocus
        aria-label="Type"
        className="w-full min-h-8 bg-transparent text-sm outline-none"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") onCommit();
        }}
      >
        <option value="">—</option>
        {["income", "expense", "transfer"].map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
    );
  }

  if (field === "category") {
    return (
      <select
        autoFocus
        aria-label="Category"
        className="w-full min-h-8 bg-transparent text-sm outline-none"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") onCommit();
        }}
      >
        <option value="">—</option>
        {categories.map((category) => (
          <option key={category.id} value={category.name}>{category.name}</option>
        ))}
      </select>
    );
  }

  const accountOptions = field === "to_account"
    ? accounts
    : accounts;

  if (field === "account" || field === "to_account") {
    return (
      <select
        autoFocus
        aria-label={SHEET_HEADERS[field]}
        className="w-full min-h-8 bg-transparent text-sm outline-none"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") onCommit();
        }}
      >
        <option value="">—</option>
        {accountOptions.map((account) => (
          <option key={account.id} value={account.name}>{account.name}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      autoFocus
      type={inputType}
      aria-label={SHEET_HEADERS[field]}
      className="tnum w-full min-h-8 bg-transparent text-sm outline-none"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        onChange(draft);
        onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          onChange(draft);
          onCommit();
        }
      }}
    />
  );
}

/**
 * On a phone a full 8-column grid is unusable, so each record becomes a card
 * with every field editable. It edits the exact same draft rows.
 */
function MobileSheet({ rows, allRows, accounts, categories, currency, onChange, onAdd }: {
  rows: number[];
  allRows: DraftRow[];
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  currency: ReturnType<typeof useWorkspace>["currency"];
  context: ParseContext;
  onChange: (rowIndex: number, field: SheetField, value: string) => void;
  onDelete: () => void;
  onAdd: () => void;
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-2 md:hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">Mobile view · tap a record to edit</p>
        <Button size="sm" onClick={onAdd}>Add row</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No transactions yet">Add a row to get started.</EmptyState>
      ) : null}

      {rows.map((rowIndex) => {
        const row = allRows[rowIndex];
        const open = openRow === rowIndex;
        return (
          <div
            key={rowIndex}
            className={`rounded-[12px] border px-3 py-2 ${
              row.state === "error"
                ? "border-[var(--negative)]"
                : row.state === "conflict"
                  ? "border-[var(--warning)]"
                  : "border-[var(--line)]"
            }`}
          >
            <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpenRow(open ? null : rowIndex)}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.cells.description || "New record"}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {row.cells.date || "no date"} · {row.cells.type || "no type"} · {row.cells.account || "no account"}
                </span>
              </span>
              <span className="tnum shrink-0 text-sm">{displayAmount(row.cells.amount, currency)}</span>
            </button>

            {open ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MobileField label="Date">
                  <Input type="date" value={row.cells.date} onChange={(event) => onChange(rowIndex, "date", event.target.value)} />
                </MobileField>
                <MobileField label="Type">
                  <Select value={row.cells.type} onChange={(event) => onChange(rowIndex, "type", event.target.value)}>
                    <option value="">—</option>
                    {["income", "expense", "transfer"].map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </Select>
                </MobileField>
                <MobileField label="Description" wide>
                  <Input value={row.cells.description} onChange={(event) => onChange(rowIndex, "description", event.target.value)} />
                </MobileField>
                <MobileField label="Amount">
                  <Input inputMode="decimal" value={row.cells.amount} onChange={(event) => onChange(rowIndex, "amount", event.target.value)} />
                </MobileField>
                <MobileField label="Category">
                  <Select value={row.cells.category} onChange={(event) => onChange(rowIndex, "category", event.target.value)}>
                    <option value="">—</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.name}>{category.name}</option>
                    ))}
                  </Select>
                </MobileField>
                <MobileField label="Account">
                  <Select value={row.cells.account} onChange={(event) => onChange(rowIndex, "account", event.target.value)}>
                    <option value="">—</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.name}>{account.name}</option>
                    ))}
                  </Select>
                </MobileField>
                <MobileField label="Destination account" wide>
                  <Select value={row.cells.to_account} onChange={(event) => onChange(rowIndex, "to_account", event.target.value)}>
                    <option value="">—</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.name}>{account.name}</option>
                    ))}
                  </Select>
                </MobileField>
                <MobileField label="Notes" wide>
                  <Input value={row.cells.notes} onChange={(event) => onChange(rowIndex, "notes", event.target.value)} />
                </MobileField>
                {row.issues.length > 0 ? (
                  <p className="col-span-2 text-xs text-[var(--negative)]">{row.issues[0].reason}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MobileField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}







