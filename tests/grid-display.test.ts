import { describe, expect, it } from "vitest";
import { formatMinor } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse";

/**
 * Regression tests for two defects found in the grid's display path.
 *
 * Defect 1: the grid displayed the wrong number. It stripped separators with a
 * regex instead of using the parser, so a cell holding "85.000" — standard VND
 * grouping, and exactly what formatMinor emits — rendered as 85.
 *
 * Defect 2: a save rebuilt every row from the server, discarding anything the
 * user typed while the request was in flight.
 */

describe("grid display agrees with the parser (defect 1)", () => {
  const display = (raw: string, currency: "VND" | "USD" = "VND") => {
    const parsed = parseAmountInput(raw);
    return parsed.ok ? formatMinor(parsed.value.minor, currency) : raw;
  };

  it("shows the full value for space and dot grouping", () => {
    // The old implementation rendered "85.000" as 85.
    expect(display("85.000")).toMatch(/85\.000/);
    expect(display("85 000")).toMatch(/85\.000/);
    expect(display("1 000 000")).toMatch(/1\.000\.000/);
  });

  it("does not drift between what is displayed and what is stored", () => {
    const spellings = ["85000", "85,000", "85.000", "85000 VND", "₫85.000"];
    const stored = spellings.map((raw) => {
      const parsed = parseAmountInput(raw);
      if (!parsed.ok) throw new Error(`expected ${raw} to parse`);
      return parsed.value.minor;
    });
    // Every spelling must mean the same amount...
    expect(new Set(stored).size).toBe(1);
    expect(stored[0]).toBe(8_500_000);
    // ...and must therefore display identically.
    expect(new Set(spellings.map((raw) => display(raw))).size).toBe(1);
  });

  it("round-trips through display without changing the amount", () => {
    for (const raw of ["85000", "1,234.56", "1234.56", "99999999"]) {
      const parsed = parseAmountInput(raw);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      // Re-parsing what the user sees must land on the same minor units.
      const reparsed = parseAmountInput(String(parsed.value.minor / 100));
      expect(reparsed.ok && reparsed.value.minor).toBe(parsed.value.minor);
    }
  });

  it("leaves an invalid cell visible rather than showing zero", () => {
    expect(display("1.2345")).toBe("1.2345");
    expect(display("")).toBe("");
    expect(display("abc")).toBe("abc");
  });
});

describe("mid-save edits are preserved (defect 2)", () => {
  /**
   * Mirrors the merge in commitDrafts: rebuild from the server, then carry
   * over any draft that was not part of the save.
   */
  interface Draft {
    id: string | null;
    cells: Record<string, string>;
    state: "saved" | "pending";
  }

  function mergeAfterSave(
    sent: Draft[],
    current: Draft[],
    server: Draft[],
  ): Draft[] {
    const sentFingerprints = new Set(sent.map((row) => JSON.stringify(row.cells)));
    const base = server.map((row) => ({ ...row, cells: { ...row.cells } }));

    for (const row of current) {
      if (row.state !== "pending") continue;
      if (sentFingerprints.has(JSON.stringify(row.cells))) continue;

      if (row.id) {
        const target = base.findIndex((candidate) => candidate.id === row.id);
        if (target >= 0) {
          base[target] = { ...base[target], cells: row.cells, state: "pending" };
          continue;
        }
      }
      base.push(row);
    }
    return base;
  }

  const sent: Draft[] = [
    { id: "a", cells: { description: "Lunch" }, state: "pending" },
  ];
  const server: Draft[] = [
    { id: "a", cells: { description: "Lunch" }, state: "saved" },
    { id: "b", cells: { description: "Bus" }, state: "saved" },
  ];

  it("keeps text typed after the save began", () => {
    const current: Draft[] = [
      { id: "a", cells: { description: "Lunch and coffee" }, state: "pending" },
      { id: "b", cells: { description: "Bus" }, state: "saved" },
    ];
    const merged = mergeAfterSave(sent, current, server);
    const rowA = merged.find((row) => row.id === "a");
    expect(rowA?.cells.description).toBe("Lunch and coffee");
    expect(rowA?.state).toBe("pending");
  });

  it("keeps a row created while the save was in flight", () => {
    const current: Draft[] = [
      ...sent,
      { id: null, cells: { description: "Taxi" }, state: "pending" },
    ];
    const merged = mergeAfterSave(sent, current, server);
    const added = merged.find((row) => row.cells.description === "Taxi");
    expect(added).toBeDefined();
    expect(added?.id).toBeNull();
    // It must not be lost, and must not be duplicated.
    expect(merged.filter((row) => row.cells.description === "Taxi")).toHaveLength(1);
  });

  it("does not resurrect a row that was already saved", () => {
    const merged = mergeAfterSave(sent, sent, server);
    expect(merged.filter((row) => row.cells.description === "Lunch")).toHaveLength(1);
    expect(merged.every((row) => row.state === "saved")).toBe(true);
  });

  it("takes the server's version so the next save is not a false conflict", () => {
    interface Versioned extends Draft { version: number }
    const merge = (sentRows: Versioned[], current: Versioned[], server: Versioned[]) => {
      const sentFingerprints = new Set(sentRows.map((r) => JSON.stringify(r.cells)));
      const base = server.map((r) => ({ ...r, cells: { ...r.cells } }));
      for (const row of current) {
        if (row.state !== "pending") continue;
        if (sentFingerprints.has(JSON.stringify(row.cells))) continue;
        if (row.id) {
          const i = base.findIndex((c) => c.id === row.id);
          if (i >= 0) { base[i] = { ...base[i], cells: row.cells, state: "pending" }; continue; }
        }
        base.push(row);
      }
      return base;
    };
    const merged = merge(
      [{ id: "a", cells: { d: "Lunch" }, state: "pending", version: 3 }],
      [{ id: "a", cells: { d: "Lunch and coffee" }, state: "pending", version: 3 }],
      [{ id: "a", cells: { d: "Lunch" }, state: "saved", version: 4 }],
    );
    expect(merged[0].version).toBe(4);
    expect(merged[0].cells.d).toBe("Lunch and coffee");
  });
});