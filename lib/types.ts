/**
 * Shared domain types.
 *
 * Money is always represented as an INTEGER number of minor units at scale 100
 * (i.e. 85,000 VND is stored as 8_500_000). PostgreSQL stores `numeric(18,2)`.
 * Integer minor units avoid binary floating point drift in every calculation.
 */

export const MINOR_SCALE = 100;

export type TxType = "income" | "expense" | "transfer";

export type CategoryKind = "income" | "expense";

export type AccountKind = "cash" | "bank" | "savings" | "ewallet";

export type CurrencyCode = "VND" | "USD" | "AUD";

export interface Profile {
  user_id: string;
  currency: CurrencyCode;
  month_start_day: number;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  /** Opening balance in minor units (scale 100). */
  opening_balance: number;
  archived: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  kind: CategoryKind;
  archived: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  /** Calendar date, ISO `YYYY-MM-DD`. Date-only, no timezone. */
  date: string;
  description: string;
  type: TxType;
  /** Null for transfers. */
  category_id: string | null;
  account_id: string;
  /** Destination account. Set only for transfers. */
  to_account_id: string | null;
  /** Positive integer minor units (scale 100). */
  amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
  /** Optimistic concurrency token. */
  version: number;
}

/** A transaction as supplied by the spreadsheet / import, before it is saved. */
export interface TransactionInput {
  date: string;
  description: string;
  type: TxType;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  amount: number;
  notes: string;
}

/** An existing transaction being updated. */
export interface TransactionUpdate extends TransactionInput {
  id: string;
  version: number;
}

export interface Budget {
  id: string;
  user_id: string;
  /** `YYYY-MM`. */
  month: string;
  /** Null = overall monthly budget. */
  category_id: string | null;
  /** Minor units, positive. */
  amount: number;
  created_at: string;
}

export const ACCOUNT_KINDS: AccountKind[] = ["cash", "bank", "savings", "ewallet"];

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Education",
  "Entertainment",
  "Health",
  "Subscriptions",
  "Pets",
  "Travel",
  "Other",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  "Allowance",
  "Salary",
  "Freelance",
  "Gifts",
  "Other",
] as const;