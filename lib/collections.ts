"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_ENABLED, demoLoad, demoSave } from "./demo";
import { decimalStringToMinor } from "./money";
import { useWorkspace } from "./store";

/**
 * Small data hook for the planning tables (bills, goals, debts, buckets).
 *
 * Money columns are converted to integer minor units on the way in and back to
 * decimal strings on the way out, exactly like the transactions data layer.
 * In demo mode everything stays in memory. A table that does not exist yet
 * (migration 0004 not applied) is reported as `missing`, not as a crash.
 */
export type CollectionState = "loading" | "ready" | "missing" | "error";

export interface CollectionSpec<T> {
  table: string;
  money: (keyof T & string)[];
  order?: { column: string; ascending?: boolean };
  demo?: () => T[];
}

export interface Collection<T> {
  rows: T[];
  state: CollectionState;
  error: string | null;
  reload: () => Promise<void>;
  insert: (values: Partial<T>) => Promise<void>;
  update: (id: string, patch: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const MISSING = /does not exist|could not find the table|PGRST205|42P01/i;

function fromRow<T>(row: Record<string, unknown>, money: string[]): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of money) {
    if (out[key] !== null && out[key] !== undefined) out[key] = decimalStringToMinor(String(out[key]));
  }
  return out as T;
}

function toRow<T>(values: Partial<T>, money: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  delete out.id;
  delete out.user_id;
  delete out.created_at;
  for (const key of money) {
    if (typeof out[key] === "number") out[key] = ((out[key] as number) / 100).toFixed(2);
  }
  return out;
}

export function useCollection<T extends { id: string }>(spec: CollectionSpec<T>): Collection<T> {
  const { client, user } = useWorkspace();
  const [rows, setRows] = useState<T[]>([]);
  const [state, setState] = useState<CollectionState>("loading");
  const [error, setError] = useState<string | null>(null);
  const { table, money, order, demo } = spec;
  const orderColumn = order?.column ?? "created_at";
  const ascending = order?.ascending ?? true;

  const reload = useCallback(async () => {
    if (DEMO_ENABLED) return;
    if (!client || !user) return;
    const { data, error: loadError } = await client.from(table).select("*").order(orderColumn, { ascending });
    if (loadError) {
      setError(loadError.message);
      setState(MISSING.test(`${loadError.code} ${loadError.message}`) ? "missing" : "error");
      return;
    }
    setRows(((data ?? []) as Record<string, unknown>[]).map((row) => fromRow<T>(row, money)));
    setError(null);
    setState("ready");
    // `money` is a stable literal per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, user, table, orderColumn, ascending]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (DEMO_ENABLED) {
        setRows(demoLoad<T[]>(table) ?? (demo ? demo() : []));
        setState("ready");
        return;
      }
      void reload();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const fail = (message: string) => {
    throw new Error(message);
  };

  const insert = useCallback(
    async (values: Partial<T>) => {
      if (DEMO_ENABLED) {
        const row = { created_at: new Date().toISOString(), ...values, id: crypto.randomUUID() } as unknown as T;
        setRows((current) => { const next = [...current, row]; demoSave(table, next); return next; });
        return;
      }
      if (!client) return fail("Not connected.");
      const { error: writeError } = await client.from(table).insert(toRow(values, money));
      if (writeError) fail(writeError.message);
      await reload();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, table, reload],
  );

  const update = useCallback(
    async (id: string, patch: Partial<T>) => {
      if (DEMO_ENABLED) {
        setRows((current) => { const next = current.map((row) => (row.id === id ? { ...row, ...patch } : row)); demoSave(table, next); return next; });
        return;
      }
      if (!client) return fail("Not connected.");
      const { error: writeError } = await client.from(table).update(toRow(patch, money)).eq("id", id);
      if (writeError) fail(writeError.message);
      await reload();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, table, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      if (DEMO_ENABLED) {
        setRows((current) => { const next = current.filter((row) => row.id !== id); demoSave(table, next); return next; });
        return;
      }
      if (!client) return fail("Not connected.");
      const { error: writeError } = await client.from(table).delete().eq("id", id);
      if (writeError) fail(writeError.message);
      await reload();
    },
    [client, table, reload],
  );

  return { rows, state, error, reload, insert, update, remove };
}

/* ----------------------------------------------------------------- types */

export type BillCycle = "weekly" | "monthly" | "quarterly" | "yearly";

export interface Bill {
  id: string;
  name: string;
  amount: number;
  cycle: BillCycle;
  next_due: string;
  category_id: string | null;
  account_id: string | null;
  notes: string;
  active: boolean;
  created_at: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  link: string;
  achieved: boolean;
  created_at: string;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  amount: number;
  tx_date: string;
  note: string;
  created_at: string;
}

export interface Debt {
  id: string;
  person: string;
  tx_date: string;
  description: string;
  amount: number;
  kind: "owed" | "repaid";
  /** Ticked when this item has been paid back. */
  settled: boolean;
  created_at: string;
}

export interface DebtShare {
  id: string;
  token: string;
  person: string;
  created_at: string;
}

export interface Bucket {
  id: string;
  name: string;
  amount: number;
  category_id: string | null;
  is_saving: boolean;
  sort: number;
  created_at: string;
}

export const BILL_SPEC: CollectionSpec<Bill> = { table: "bills", money: ["amount"], order: { column: "next_due" } };
export const GOAL_SPEC: CollectionSpec<Goal> = { table: "goals", money: ["target"] };
export const CONTRIBUTION_SPEC: CollectionSpec<GoalContribution> = {
  table: "goal_contributions",
  money: ["amount"],
  order: { column: "tx_date" },
};
export const DEBT_SPEC: CollectionSpec<Debt> = { table: "debts", money: ["amount"], order: { column: "tx_date" } };
export const BUCKET_SPEC: CollectionSpec<Bucket> = { table: "buckets", money: ["amount"], order: { column: "sort" } };

/** Advance a due date by one billing cycle (date-only, no timezone). */
export function nextDueDate(date: string, cycle: BillCycle): string {
  const [y, m, d] = date.split("-").map(Number);
  if (cycle === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return t.toISOString().slice(0, 10);
  }
  const months = cycle === "monthly" ? 1 : cycle === "quarterly" ? 3 : 12;
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Monthly cost of a bill, for "per month" totals. */
export function monthlyCost(bill: Pick<Bill, "amount" | "cycle">): number {
  if (bill.cycle === "weekly") return Math.round((bill.amount * 52) / 12);
  if (bill.cycle === "quarterly") return Math.round(bill.amount / 3);
  if (bill.cycle === "yearly") return Math.round(bill.amount / 12);
  return bill.amount;
}
