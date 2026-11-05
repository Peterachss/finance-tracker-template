import type { Workspace } from "./supabase/data";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./types";

/**
 * Try-it mode, on when NEXT_PUBLIC_DEMO=1 (locally or on a public deploy).
 * No sign-in and no database: it starts like a brand-new account (Cash and
 * Bank transfer at 0, the default categories, no transactions) and everything
 * entered is kept in this browser's localStorage only.
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO === "1";

/** Browser-only storage for try-it mode. Fails quietly when storage is blocked. */
export function demoLoad<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`ft-demo:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function demoSave(key: string, value: unknown) {
  try {
    localStorage.setItem(`ft-demo:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

const U = "demo-user";
const at = "2026-01-01T00:00:00Z";

export function demoWorkspace(): Workspace {
  const categories = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, kind: "expense" as const })),
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, kind: "income" as const })),
  ].map((c, i) => ({ id: `c${i}`, user_id: U, name: c.name, kind: c.kind, archived: false, created_at: at }));

  return {
    profile: { user_id: U, currency: "VND", month_start_day: 1, created_at: at },
    accounts: [
      { id: "a1", user_id: U, name: "Cash", kind: "cash", currency: "VND", opening_balance: 0, archived: false, created_at: at },
      { id: "a2", user_id: U, name: "Bank transfer", kind: "bank", currency: "VND", opening_balance: 0, archived: false, created_at: at },
    ],
    categories,
    transactions: [],
    budgets: [],
  };
}
