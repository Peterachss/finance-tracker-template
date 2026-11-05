import { describe, expect, it } from "vitest";
import {
  describeBatchFailure,
  emptyCells,
  hasUnsavedChanges,
  partitionBatch,
  validateDraft,
  type DraftRow,
} from "@/lib/batch";
import type { ParseContext } from "@/lib/parse";

const context: ParseContext = {
  accounts: [
    { id: "a1", user_id: "u1", name: "Cash", kind: "cash", currency: "VND", opening_balance: 0, archived: false, created_at: "" },
    { id: "a2", user_id: "u1", name: "Bank", kind: "bank", currency: "VND", opening_balance: 0, archived: false, created_at: "" },
  ],
  categories: [
    { id: "c1", user_id: "u1", name: "Food", kind: "expense", archived: false, created_at: "" },
  ],
  currency: "VND",
};

function draft(cells: Partial<DraftRow["cells"]>, overrides: Partial<DraftRow> = {}): DraftRow {
  return validateDraft(
    { id: null, version: null, cells: { ...emptyCells(), ...cells }, state: "pending", issues: [], ...overrides },
    context,
  );
}

describe("draft validation", () => {
  it("marks a valid row pending", () => {
    const row = draft({ date: "2026-03-01", description: "Lunch", type: "Expense", category: "Food", account: "Cash", amount: "85000" });
    expect(row.state).toBe("pending");
    expect(row.issues).toEqual([]);
  });

  it("marks an invalid row as an error and never sends it", () => {
    const row = draft({ date: "nope", description: "Lunch", type: "Expense", account: "Cash", amount: "85000" });
    expect(row.state).toBe("error");
    expect(row.issues.some((i) => i.field === "date")).toBe(true);
  });

  it("treats a blank row as unsaved rather than broken", () => {
    const row = validateDraft(
      { id: null, version: null, cells: emptyCells(), state: "saved", issues: [] },
      context,
    );
    expect(row.state).toBe("saved");
    expect(row.issues).toEqual([]);
  });
});

describe("blank placeholder row (found by inspecting the running app)", () => {
  const blank = validateDraft(
    { id: null, version: null, cells: emptyCells(), state: "pending", issues: [] },
    context,
  );

  it("is never reported as unsaved work", () => {
    expect(blank.state).toBe("saved");
    expect(hasUnsavedChanges([blank])).toBe(false);
  });

  it("never blocks a save", () => {
    const batch = partitionBatch([blank], context);
    expect(batch.canCommit).toBe(true);
    expect(batch.creates).toHaveLength(0);
    expect(batch.invalid).toHaveLength(0);
  });

  it("does not block a batch that has real rows", () => {
    const real = draft({
      date: "2026-03-01",
      description: "Lunch",
      type: "Expense",
      category: "Food",
      account: "Cash",
      amount: "85000",
    });
    const batch = partitionBatch([real, blank], context);
    expect(batch.canCommit).toBe(true);
    expect(batch.creates).toHaveLength(1);
    expect(hasUnsavedChanges([real, blank])).toBe(true);
  });

  it("does not block a batch that has an invalid row either", () => {
    const bad = draft({ date: "nope", description: "x", type: "Expense", account: "Cash", amount: "1" });
    const batch = partitionBatch([bad, blank], context);
    // The invalid row still blocks, but the placeholder is not the cause.
    expect(batch.canCommit).toBe(false);
    expect(batch.invalid).toHaveLength(1);
    expect(batch.invalid[0].issues[0].field).toBe("date");
  });
});

describe("batch partitioning", () => {
  it("splits new rows into creates and existing rows into updates", () => {
    const rows = [
      draft({ date: "2026-03-01", description: "New", type: "Expense", category: "Food", account: "Cash", amount: "85000" }),
      draft(
        { date: "2026-03-02", description: "Edited", type: "Expense", category: "Food", account: "Cash", amount: "90000" },
        { id: "tx-1", version: 4 },
      ),
    ];
    const batch = partitionBatch(rows, context);
    expect(batch.creates).toHaveLength(1);
    expect(batch.updates).toEqual([
      expect.objectContaining({ id: "tx-1", version: 4, amount: 9_000_000 }),
    ]);
  });

  it("is all-or-nothing: one invalid row stops the whole batch", () => {
    const rows = [
      draft({ date: "2026-03-01", description: "Fine", type: "Expense", category: "Food", account: "Cash", amount: "85000" }),
      draft({ date: "not-a-date", description: "Broken", type: "Expense", category: "Food", account: "Cash", amount: "85000" }),
    ];
    const batch = partitionBatch(rows, context);
    expect(batch.canCommit).toBe(false);
    // Nothing is sent: a partial paste must never be half-applied.
    expect(batch.creates).toHaveLength(0);
    expect(batch.updates).toHaveLength(0);
    expect(batch.invalid).toHaveLength(1);
    expect(batch.invalid[0].issues[0].field).toBe("date");
  });

  it("commits the valid rows only when invalid ones are explicitly excluded", () => {
    const rows = [
      draft({ date: "2026-03-01", description: "Fine", type: "Expense", category: "Food", account: "Cash", amount: "85000" }),
      draft({ date: "not-a-date", description: "Broken", type: "Expense", category: "Food", account: "Cash", amount: "85000" }),
    ];
    const batch = partitionBatch(rows, context, { excludeInvalid: true });
    expect(batch.canCommit).toBe(true);
    expect(batch.creates).toHaveLength(1);
    // The caller still gets the exact rows that will be left out.
    expect(batch.invalid.map((row) => row.cells.description)).toEqual(["Broken"]);
  });

  it("keeps conflicted rows out of the payload and preserves the local edit", () => {
    const row: DraftRow = {
      id: "tx-1",
      version: 4,
      cells: { ...emptyCells(), date: "2026-03-02", description: "Mine", type: "Expense", category: "Food", account: "Cash", amount: "90000" },
      state: "conflict",
      issues: [],
      error: "Another device changed this row first.",
    };
    const batch = partitionBatch([row], context);
    expect(batch.canCommit).toBe(false);
    expect(batch.creates).toHaveLength(0);
    expect(batch.updates).toHaveLength(0);
    expect(batch.invalid[0].cells.description).toBe("Mine");
    expect(batch.invalid[0].version).toBe(4);
  });

  it("ignores rows already saved", () => {
    const row: DraftRow = {
      id: "tx-1",
      version: 1,
      cells: { ...emptyCells(), date: "2026-03-02", description: "Done", type: "Expense", category: "Food", account: "Cash", amount: "90000" },
      state: "saved",
      issues: [],
    };
    expect(hasUnsavedChanges([row])).toBe(false);
    expect(partitionBatch([row], context).updates).toHaveLength(0);
  });
});

describe("optimistic concurrency", () => {
  it("parses the conflict list raised by the database", () => {
    const failure = describeBatchFailure(
      new Error("FINANCE_CONFLICT:11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222 rest of it"),
    );
    expect(failure.aborted).toBe(true);
    expect(failure.conflicts).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    expect(failure.message).toMatch(/Nothing was saved/);
  });

  it("reports a plain failure with no conflicts", () => {
    const failure = describeBatchFailure(new Error("network down"));
    expect(failure.conflicts).toEqual([]);
    expect(failure.aborted).toBe(true);
    expect(failure.message).toBe("network down");
  });

  it("treats an empty error as a failure rather than a success", () => {
    expect(describeBatchFailure(null).aborted).toBe(true);
  });
});

describe("unsaved changes", () => {
  it("detects pending, error and conflict states", () => {
    const base = draft({ date: "2026-03-01", description: "x", type: "Expense", category: "Food", account: "Cash", amount: "1" });
    expect(hasUnsavedChanges([base])).toBe(true);
    expect(hasUnsavedChanges([{ ...base, state: "saved" }])).toBe(false);
    expect(hasUnsavedChanges([{ ...base, state: "error" }])).toBe(true);
    expect(hasUnsavedChanges([{ ...base, state: "conflict" }])).toBe(true);
  });
});