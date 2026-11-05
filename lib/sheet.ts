/**
 * Spreadsheet mechanics: delimited-text parsing and paste placement.
 *
 * These functions are pure so the grid's most dangerous behaviour (a pasted
 * block landing on the wrong rows/columns) can be unit tested directly.
 */

export const SHEET_COLUMNS = [
  "date",
  "description",
  "type",
  "category",
  "account",
  "to_account",
  "amount",
  "notes",
] as const;

export type SheetField = (typeof SHEET_COLUMNS)[number];

export const SHEET_HEADERS: Record<SheetField, string> = {
  date: "Date",
  description: "Description",
  type: "Type",
  category: "Category",
  account: "Account",
  to_account: "Destination Account",
  amount: "Amount",
  notes: "Notes",
};

/** Width of a rendered column, in px. */
export const SHEET_COLUMN_WIDTH: Record<SheetField, number> = {
  date: 120,
  description: 220,
  type: 110,
  category: 150,
  account: 150,
  to_account: 150,
  amount: 130,
  notes: 220,
};

const DELIMITERS = ["\t", ";", ","] as const;

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  for (const delimiter of DELIMITERS) {
    if (firstLine.includes(delimiter)) return delimiter;
  }
  return "\t";
}

/**
 * Parse CSV or TSV text into a rectangular matrix. Handles quoted fields,
 * `""` escapes, CRLF/LF/CR line endings and a trailing newline.
 * Values are returned verbatim as text — no coercion, no formula evaluation.
 */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // A trailing newline must not create a phantom final row.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Make the matrix rectangular and drop padding that spreadsheet apps append:
 * a fully blank trailing row, and trailing empty columns.
 */
export function normalizeMatrix(matrix: string[][]): string[][] {
  const rows = matrix.map((row) => row.map((cell) => cell.trim()));

  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === "")) {
    rows.pop();
  }
  if (rows.length === 0) return rows;

  let width = 0;
  for (const row of rows) {
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] !== "") {
        width = Math.max(width, c + 1);
      }
    }
  }

  return rows.map((row) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });
}

export function toTsv(matrix: string[][]): string {
  return matrix
    .map((row) => row.map((cell) => (/[\t\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join("\t"))
    .join("\n");
}

export interface PasteTarget {
  /** Index of the row in the grid that receives this cell. */
  row: number;
  /** Index of the column in the grid that receives this cell. */
  col: number;
  field: SheetField;
  raw: string;
}

export interface PastePlan {
  targets: PasteTarget[];
  /** Grid row indexes that already hold a record (paste edits them). */
  editedRows: number[];
  /** Grid row indexes that do not exist yet and will be appended. */
  newRows: number[];
  /** True when the block runs past the last grid column. */
  columnOverflow: boolean;
  /** Number of cells that fell outside the grid columns and were rejected. */
  droppedCells: number;
}

/**
 * Work out where every pasted cell lands.
 *
 * The block starts at the active cell and fills across then down, which is
 * the same order every spreadsheet uses. Cells below the last row describe
 * records that must be appended; cells over existing records describe edits.
 */
export function planPaste(params: {
  matrix: string[][];
  anchorRow: number;
  anchorCol: number;
  /** Number of records currently in the grid. */
  rowCount: number;
}): PastePlan {
  const { matrix, anchorRow, anchorCol, rowCount } = params;
  const targets: PasteTarget[] = [];
  const editedRows = new Set<number>();
  const newRows = new Set<number>();
  let columnOverflow = false;
  let droppedCells = 0;

  for (let r = 0; r < matrix.length; r += 1) {
    const gridRow = anchorRow + r;
    if (gridRow < rowCount) editedRows.add(gridRow);
    else newRows.add(gridRow);

    for (let c = 0; c < matrix[r].length; c += 1) {
      const gridCol = anchorCol + c;
      if (gridCol >= SHEET_COLUMNS.length) {
        columnOverflow = true;
        droppedCells += 1;
        continue;
      }
      targets.push({
        row: gridRow,
        col: gridCol,
        field: SHEET_COLUMNS[gridCol],
        raw: matrix[r][c],
      });
    }
  }

  return {
    targets,
    editedRows: [...editedRows].sort((a, b) => a - b),
    newRows: [...newRows].sort((a, b) => a - b),
    columnOverflow,
    droppedCells,
  };
}

const HEADER_ALIASES: Record<SheetField, string[]> = {
  date: ["date", "transaction date", "txn date", "posted date", "ngày", "ngay"],
  description: ["description", "details", "detail", "name", "note", "memo", "nội dung", "mo ta"],
  type: ["type", "transaction type", "kind", "loại", "loai"],
  category: ["category", "cat", "danh mục", "danh muc"],
  account: ["account", "source account", "from", "account name", "tài khoản", "tai khoan"],
  to_account: ["to account", "destination", "destination account", "to", "transfer to", "đến", "den"],
  amount: ["amount", "value", "total", "số tiền", "so tien", "amount (vnd)", "amount vnd"],
  notes: ["notes", "note", "memo", "comment", "ghi chú", "ghi chu"],
};

/** Map a pasted header row to sheet fields; unrecognised columns map to null. */
export function mapHeaderRow(header: string[]): (SheetField | null)[] {
  return header.map((raw) => {
    const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ").trim();
    if (key === "") return null;
    for (const field of SHEET_COLUMNS) {
      if (HEADER_ALIASES[field].includes(key)) return field;
    }
    return null;
  });
}

export function looksLikeHeaderRow(row: string[]): boolean {
  const mapped = mapHeaderRow(row);
  const known = mapped.filter((field) => field !== null).length;
  return known >= 2 && known / Math.max(1, row.length) >= 0.4;
}