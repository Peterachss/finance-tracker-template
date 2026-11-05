import type { SupabaseClient } from "@supabase/supabase-js";
import { decimalStringToMinor } from "../money";
import type {
  Account,
  Budget,
  Category,
  CurrencyCode,
  Profile,
  Transaction,
  TransactionInput,
  TransactionUpdate,
} from "../types";

/**
 * All reads and writes go through here so that:
 *  - numeric columns are converted to integer minor units in one place;
 *  - PostgREST's 1000-row default never silently truncates a result set.
 */

const PAGE_SIZE = 1000;

interface RawTransaction {
  id: string;
  user_id: string;
  tx_date: string;
  description: string;
  type: string;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  amount: string | number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

function toTransaction(row: RawTransaction): Transaction {
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.tx_date,
    description: row.description,
    type: row.type as Transaction["type"],
    category_id: row.category_id,
    account_id: row.account_id,
    to_account_id: row.to_account_id,
    amount: decimalStringToMinor(row.amount),
    notes: row.notes ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

/** Read a table in pages until the server runs out of rows. */
async function fetchAllPaged<T>(
  client: SupabaseClient,
  table: string,
  build: (rows: Record<string, unknown>[]) => T[],
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...build(rows));
    if (rows.length < PAGE_SIZE) return out;
  }
}

export interface Workspace {
  profile: Profile | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

export async function loadWorkspace(client: SupabaseClient): Promise<Workspace> {
  // Every table in one parallel round: on a phone each extra round trip is felt.
  const [{ data: profileRow, error: profileError }, accounts, categories, transactions, budgets] = await Promise.all([
    client.from("profiles").select("*").maybeSingle(),
    fetchAllPaged<Account>(client, "accounts", (rows) =>
      rows.map((row) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        name: row.name as string,
        kind: row.kind as Account["kind"],
        currency: row.currency as CurrencyCode,
        opening_balance: decimalStringToMinor(row.opening_balance as string),
        archived: Boolean(row.archived),
        created_at: row.created_at as string,
      })),
    ),
    fetchAllPaged<Category>(client, "categories", (rows) =>
      rows.map((row) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        name: row.name as string,
        kind: row.kind as Category["kind"],
        archived: Boolean(row.archived),
        created_at: row.created_at as string,
      })),
    ),
    fetchAllPaged<Transaction>(client, "transactions", (rows) => rows.map((row) => toTransaction(row as unknown as RawTransaction))),
    fetchAllPaged<Budget>(client, "budgets", (rows) =>
      rows.map((row) => ({
        id: row.id as string,
        user_id: row.user_id as string,
        month: row.month as string,
        category_id: (row.category_id as string | null) ?? null,
        amount: decimalStringToMinor(row.amount as string),
        created_at: row.created_at as string,
      })),
    ),
  ]);
  if (profileError) throw new Error(`profiles: ${profileError.message}`);

  const profile: Profile | null = profileRow
    ? {
        user_id: profileRow.id as string,
        currency: profileRow.currency as CurrencyCode,
        month_start_day: profileRow.month_start_day as number,
        created_at: profileRow.created_at as string,
      }
    : null;

  return { profile, accounts, categories, transactions, budgets };
}

function serialiseCreate(input: TransactionInput) {
  return {
    date: input.date,
    description: input.description,
    type: input.type,
    category_id: input.category_id,
    account_id: input.account_id,
    to_account_id: input.to_account_id,
    amount: (input.amount / 100).toFixed(2),
    notes: input.notes,
  };
}

/**
 * Commit a whole batch in one atomic database call. Either every row is
 * written or none is; a conflict aborts everything.
 *
 * `requestId` makes the call retry-safe: the server records it, and a replay of
 * the same id returns the stored result instead of inserting the rows again.
 * If migration 0002 has not been applied yet the call falls back to the
 * original RPC, which is atomic but not replay-safe.
 */
export async function saveTransactionBatch(
  client: SupabaseClient,
  creates: TransactionInput[],
  updates: TransactionUpdate[],
  requestId?: string,
): Promise<{ created: number; updated: number; replayed?: boolean }> {
  const payload = {
    p_creates: creates.map(serialiseCreate),
    p_updates: updates.map((update) => ({ ...serialiseCreate(update), id: update.id, version: update.version })),
  };

  if (requestId) {
    const { data, error } = await client.rpc("apply_transaction_batch_idempotent", {
      p_request_id: requestId,
      ...payload,
    });
    // PGRST202: function not found in the schema cache (migration not applied).
    if (!error) return (data ?? { created: 0, updated: 0 }) as { created: number; updated: number; replayed?: boolean };
    if (error.code !== "PGRST202") throw new Error(error.message);
  }

  const { data, error } = await client.rpc("apply_transaction_batch", payload);
  if (error) throw new Error(error.message);
  return (data ?? { created: 0, updated: 0 }) as { created: number; updated: number };
}

export async function deleteTransactions(client: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client.from("transactions").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

/**
 * Update the signed-in user's preferences. RLS restricts this to the
 * authenticated row, so no user id is supplied by the client.
 */
export async function updateProfile(
  client: SupabaseClient,
  patch: Partial<Pick<Profile, "currency" | "month_start_day">>,
): Promise<void> {
  const { error } = await client.from("profiles").update(patch);
  if (error) throw new Error(error.message);
}

export async function saveAccount(
  client: SupabaseClient,
  account: Partial<Account> & { name: string },
): Promise<void> {
  const payload: Record<string, unknown> = { name: account.name, kind: account.kind ?? "cash" };
  if (account.id) {
    if (account.opening_balance !== undefined) {
      payload.opening_balance = (account.opening_balance / 100).toFixed(2);
    }
    if (account.archived !== undefined) payload.archived = account.archived;
    const { error } = await client.from("accounts").update(payload).eq("id", account.id);
    if (error) throw new Error(error.message);
    return;
  }
  payload.opening_balance = ((account.opening_balance ?? 0) / 100).toFixed(2);
  const { error } = await client.from("accounts").insert(payload);
  if (error) throw new Error(error.message);
}

export async function saveCategory(
  client: SupabaseClient,
  category: Partial<Category> & { name: string; kind: Category["kind"] },
): Promise<void> {
  const payload: Record<string, unknown> = { name: category.name, kind: category.kind };
  if (category.id) {
    if (category.archived !== undefined) payload.archived = category.archived;
    const { error } = await client.from("categories").update(payload).eq("id", category.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await client.from("categories").insert(payload);
  if (error) throw new Error(error.message);
}

export async function saveBudget(
  client: SupabaseClient,
  budget: { id?: string; month: string; category_id: string | null; amount: number },
): Promise<void> {
  const payload = { month: budget.month, category_id: budget.category_id, amount: (budget.amount / 100).toFixed(2) };
  const { error } = budget.id
    ? await client.from("budgets").update(payload).eq("id", budget.id)
    : await client.from("budgets").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteBudget(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("budgets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Idempotent: re-running never duplicates the default rows. */
export async function initializeWorkspace(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc("initialize_workspace");
  if (error) throw new Error(error.message);
}