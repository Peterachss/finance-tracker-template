"use client";

import { useMemo, useState } from "react";
import { findDuplicateCandidates } from "@/lib/duplicates";
import { parseBlock, type ParseContext, type ParsedRow } from "@/lib/parse";
import {
  looksLikeHeaderRow,
  mapHeaderRow,
  normalizeMatrix,
  SHEET_COLUMNS,
  SHEET_HEADERS,
  type SheetField,
} from "@/lib/sheet";
import { formatMinor } from "@/lib/money";
import type { CurrencyCode, Transaction } from "@/lib/types";
import { Banner, Button, ConfirmDialog, Field, Modal, Select } from "./ui";

/**
 * Header-aware bulk import preview.
 *
 * Nothing is written until the user sees exactly what will be written. The
 * batch is all-or-nothing unless the user explicitly opts to exclude the
 * invalid rows, and then the excluded rows are listed.
 */
export function ImportPreview({ matrix, context, currency, existing, onCancel, onCommit }: {
  matrix: string[][];
  context: ParseContext;
  currency: CurrencyCode;
  existing: Transaction[];
  onCancel: () => void;
  onCommit: (rows: ParsedRow[], excluded: number[]) => void;
}) {
  const block = useMemo(() => normalizeMatrix(matrix), [matrix]);

  const [hasHeader, setHasHeader] = useState(() => block.length > 0 && looksLikeHeaderRow(block[0]));
  const [mapping, setMapping] = useState<(SheetField | null)[]>(() =>
    block.length > 0 && looksLikeHeaderRow(block[0])
      ? mapHeaderRow(block[0])
      : SHEET_COLUMNS.map((field, index) => (index < (block[0]?.length ?? 0) ? field : null)),
  );
  const [allowExcelSerial, setAllowExcelSerial] = useState(false);
  const [excludeInvalid, setExcludeInvalid] = useState(false);
  const [confirmExclude, setConfirmExclude] = useState(false);

  const headerRow = hasHeader ? block[0] : null;
  const dataRows = hasHeader ? block.slice(1) : block;
  const width = block.reduce((max, row) => Math.max(max, row.length), 0);

  const parsed = useMemo(
    () => parseBlock(dataRows, mapping, { ...context, allowExcelSerial }),
    [dataRows, mapping, context, allowExcelSerial],
  );

  const validRows = parsed.filter((row) => row.input !== null);
  const invalidRows = parsed.filter((row) => row.input === null);
  const warnings = parsed.flatMap((row) => row.warnings);
  const ignoredColumns = (headerRow ?? dataRows[0] ?? [])
    .map((label, index) => ({ label: label || `Column ${index + 1}`, index }))
    .filter((column) => mapping[column.index] === null);

  const duplicates = useMemo(() => {
    const incoming = validRows
      .filter((row) => row.input)
      .map((row) => ({ row: row.row, description: row.input!.description, input: row.input! }));
    return findDuplicateCandidates(incoming, existing);
  }, [validRows, existing]);

  const canImport = validRows.length > 0 && (invalidRows.length === 0 || excludeInvalid);

  const commit = () => {
    const excluded = excludeInvalid ? invalidRows.map((row) => row.row) : [];
    onCommit(validRows, excluded);
  };

  return (
    <Modal
      open
      onClose={onCancel}
      title="Import preview"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canImport}
            onClick={() => {
              if (excludeInvalid && invalidRows.length > 0) setConfirmExclude(true);
              else commit();
            }}
          >
            Import {validRows.length} row{validRows.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
          <span>
            <strong className="tnum text-[var(--foreground)]">{validRows.length}</strong> ready ·{" "}
            <strong className="tnum text-[var(--foreground)]">{invalidRows.length}</strong> invalid ·{" "}
            {dataRows.length} row{dataRows.length === 1 ? "" : "s"} read
          </span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hasHeader} onChange={(event) => {
              const next = event.target.checked;
              setHasHeader(next);
              setMapping(
                next
                  ? mapHeaderRow(block[0] ?? [])
                  : SHEET_COLUMNS.map((field, index) => (index < width ? field : null)),
              );
            }} />
            First row is a header
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={allowExcelSerial} onChange={(event) => setAllowExcelSerial(event.target.checked)} />
            Plain numbers are Excel serial dates
          </label>
        </div>

        {ignoredColumns.length > 0 ? (
          <Banner tone="warning" title="Ignored columns:">
            {ignoredColumns.map((column) => column.label).join(", ")} will not be imported.
          </Banner>
        ) : null}

        {duplicates.length > 0 ? (
          <Banner tone="warning" title={`${duplicates.length} possible duplicate${duplicates.length === 1 ? "" : "s"}:`}>
            Row{duplicates.length === 1 ? "" : "s"} {duplicates.map((match) => match.row).join(", ")} match a record you
            already have. They are listed, not merged or deleted.
          </Banner>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Column mapping</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: width }, (_, index) => (
              <Field key={index} label={(headerRow ?? [])[index] || `Column ${index + 1}`}>
                <Select
                  value={mapping[index] ?? ""}
                  onChange={(event) => {
                    const next = [...mapping];
                    next[index] = (event.target.value || null) as SheetField | null;
                    setMapping(next);
                  }}
                >
                  <option value="">Ignore this column</option>
                  {SHEET_COLUMNS.map((field) => (
                    <option key={field} value={field}>
                      {SHEET_HEADERS[field]}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </div>

        {invalidRows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Banner tone="error" title="These rows cannot be saved:">
              {invalidRows.length} row{invalidRows.length === 1 ? "" : "s"} have an invalid date, amount, type, account or
              category. Nothing is written unless you fix them or explicitly exclude them.
            </Banner>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs text-[var(--negative)]">
              {invalidRows.flatMap((row) =>
                row.issues.map((issue) => (
                  <li key={`${row.row}-${issue.field}-${issue.reason}`}>
                    Row {row.row} · {SHEET_HEADERS[issue.field as SheetField] ?? "row"}: {issue.reason}
                  </li>
                )),
              )}
            </ul>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={excludeInvalid}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setExcludeInvalid(event.target.checked)}
              />
              Exclude the {invalidRows.length} invalid row{invalidRows.length === 1 ? "" : "s"} and import the rest
            </label>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <Banner tone="warning" title="Check these:">
            <ul className="list-disc pl-4">
              {warnings.map((warning) => (
                <li key={`${warning.row}-${warning.field}-${warning.reason}`}>
                  Row {warning.row} · {SHEET_HEADERS[warning.field as SheetField] ?? "row"}: {warning.reason}
                </li>
              ))}
            </ul>
          </Banner>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Sample of parsed records</p>
          {validRows.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No valid records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr>
                    {["#", "Date", "Description", "Type", "Category", "Account", "To", "Amount"].map((header) => (
                      <th key={header} className="border-b border-[var(--line)] px-2 py-1 text-left font-medium text-[var(--text-muted)]">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tnum">
                  {validRows.slice(0, 8).map((row) => {
                    const input = row.input!;
                    return (
                      <tr key={row.row} className="border-b border-[var(--line)]/60">
                        <td className="px-2 py-1 text-[var(--text-muted)]">{row.row}</td>
                        <td className="px-2 py-1">{input.date}</td>
                        <td className="px-2 py-1">{input.description}</td>
                        <td className="px-2 py-1">{input.type}</td>
                        <td className="px-2 py-1">{input.category_id ? (context.categories.find((c) => c.id === input.category_id)?.name ?? "—") : "—"}</td>
                        <td className="px-2 py-1">{context.accounts.find((a) => a.id === input.account_id)?.name ?? "—"}</td>
                        <td className="px-2 py-1">{input.to_account_id ? (context.accounts.find((a) => a.id === input.to_account_id)?.name ?? "—") : "—"}</td>
                        <td className="px-2 py-1">{formatMinor(input.amount, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {validRows.length > 8 ? (
                <p className="mt-1 text-xs text-[var(--text-muted)]">Showing 8 of {validRows.length}.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmExclude}
        title="Exclude invalid rows?"
        confirmLabel={`Import ${validRows.length} row${validRows.length === 1 ? "" : "s"}`}
        onCancel={() => setConfirmExclude(false)}
        onConfirm={() => {
          setConfirmExclude(false);
          commit();
        }}
        message={
          <>
            These rows will <strong>not</strong> be saved:{" "}
            {invalidRows.map((row) => row.row).join(", ")}. Everything else is saved in one batch. This cannot be undone
            automatically.
          </>
        }
      />
    </Modal>
  );
}
