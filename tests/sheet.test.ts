import { describe, expect, it } from "vitest";
import { normalizeMatrix, parseDelimited, detectDelimiter, toTsv } from "@/lib/sheet";
import { looksLikeHeaderRow, mapHeaderRow, planPaste, SHEET_COLUMNS } from "@/lib/sheet";

describe("delimited parsing", () => {
  it("splits a multi-row, multi-column TSV block into separate cells", () => {
    const text = "2026-03-01\tLunch\tExpense\tFood\tCash\n2026-03-02\tBus\tExpense\tTransport\tCash";
    expect(parseDelimited(text)).toEqual([
      ["2026-03-01", "Lunch", "Expense", "Food", "Cash"],
      ["2026-03-02", "Bus", "Expense", "Transport", "Cash"],
    ]);
  });

  it("keeps tabs inside quoted fields", () => {
    const text = 'a\t"one\ttwo"\tc\nd\te\tf';
    expect(parseDelimited(text)).toEqual([
      ["a", "one\ttwo", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("unescapes doubled quotes and handles CRLF and a trailing newline", () => {
    expect(parseDelimited('x,"say ""hi""",z\r\ny,q,w\r\n')).toEqual([
      ["x", 'say "hi"', "z"],
      ["y", "q", "w"],
    ]);
  });

  it("does not create a phantom row from a trailing newline", () => {
    expect(parseDelimited("a\tb\nc\td\n")).toHaveLength(2);
    expect(parseDelimited("a\tb\r\n")).toHaveLength(1);
  });

  it("keeps a single column when there is no delimiter", () => {
    expect(parseDelimited("just one line")).toEqual([["just one line"]]);
  });

  it("detects the delimiter from the first line", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a;b;c")).toBe(";");
  });
});

describe("normalizeMatrix", () => {
  it("pads ragged rows to a rectangle", () => {
    expect(normalizeMatrix([["a", "b", "c"], ["d"]])).toEqual([
      ["a", "b", "c"],
      ["d", "", ""],
    ]);
  });

  it("drops fully blank trailing rows and trailing empty columns", () => {
    expect(normalizeMatrix([["a", ""], ["b", "c"], ["", ""]])).toEqual([
      ["a", ""],
      ["b", "c"],
    ]);
  });

  it("keeps an interior blank row, because it shifts the rows below it", () => {
    expect(normalizeMatrix([["a", ""], ["", ""], ["b", "c"]])).toEqual([
      ["a", ""],
      ["", ""],
      ["b", "c"],
    ]);
  });

  it("returns an empty matrix for empty input", () => {
    expect(normalizeMatrix(parseDelimited("\n\n"))).toEqual([]);
  });
});

describe("header mapping", () => {
  it("matches common header variants", () => {
    expect(mapHeaderRow(["Transaction Date", "Details", "Type", "Amount"])).toEqual([
      "date",
      "description",
      "type",
      "amount",
    ]);
  });

  it("maps unrecognised columns to null instead of guessing", () => {
    expect(mapHeaderRow(["Date", "Bank Reference", "Amount"])).toEqual(["date", null, "amount"]);
  });

  it("recognises a header row only when most columns are known", () => {
    expect(looksLikeHeaderRow(["Date", "Description", "Amount"])).toBe(true);
    expect(looksLikeHeaderRow(["2026-03-01", "Lunch", "85000"])).toBe(false);
  });
});

describe("paste placement", () => {
  const matrix = normalizeMatrix([
    ["Lunch", "Expense", "Food"],
    ["Bus", "Expense", "Transport"],
  ]);

  it("fills across then down from the active cell", () => {
    const plan = planPaste({ matrix, anchorRow: 2, anchorCol: 1, rowCount: 5 });
    expect(plan.targets.map((t) => [t.row, t.col, t.field])).toEqual([
      [2, 1, "description"],
      [2, 2, "type"],
      [2, 3, "category"],
      [3, 1, "description"],
      [3, 2, "type"],
      [3, 3, "category"],
    ]);
  });

  it("does not put the whole block into the anchor cell", () => {
    const plan = planPaste({ matrix, anchorRow: 0, anchorCol: 0, rowCount: 0 });
    expect(plan.targets).toHaveLength(6);
    expect(plan.targets[0]).toMatchObject({ row: 0, col: 0, raw: "Lunch" });
  });

  it("treats a paste over existing rows as edits, not duplicates", () => {
    const plan = planPaste({ matrix, anchorRow: 0, anchorCol: 0, rowCount: 10 });
    expect(plan.newRows).toEqual([]);
    expect(plan.editedRows).toEqual([0, 1]);
  });

  it("appends rows when the paste runs past the last record", () => {
    const plan = planPaste({ matrix, anchorRow: 8, anchorCol: 0, rowCount: 9 });
    expect(plan.editedRows).toEqual([8]);
    expect(plan.newRows).toEqual([9]);
  });

  it("flags and counts cells that fall past the last column", () => {
    const wide = normalizeMatrix([["a", "b", "c", "d", "e", "f", "g", "h", "i"]]);
    const plan = planPaste({ matrix: wide, anchorRow: 0, anchorCol: 0, rowCount: 1 });
    expect(plan.columnOverflow).toBe(true);
    expect(plan.droppedCells).toBe(1);
    expect(plan.targets).toHaveLength(SHEET_COLUMNS.length);
  });

  it("keeps the last column addressable when anchoring on to_account", () => {
    const plan = planPaste({ matrix: normalizeMatrix([["Cash"]]), anchorRow: 0, anchorCol: 5, rowCount: 1 });
    expect(plan.targets[0].field).toBe("to_account");
  });
});

describe("copy", () => {
  it("round-trips a matrix through TSV", () => {
    const matrix = [
      ["a", "b\tc"],
      ["d", 'say "hi"'],
    ];
    expect(parseDelimited(toTsv(matrix))).toEqual(matrix);
  });
});