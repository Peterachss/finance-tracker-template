import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTransactionBatch } from "../lib/supabase/data";
import type { TransactionInput } from "../lib/types";

const row: TransactionInput = {
  date: "2026-03-01",
  description: "Lunch",
  type: "expense",
  category_id: null,
  account_id: "a1",
  to_account_id: null,
  amount: 12_500,
  notes: "",
};

function fakeClient(responses: Record<string, { data?: unknown; error?: { code?: string; message: string } | null }>) {
  const rpc = vi.fn(async (name: string) => ({ data: null, error: null, ...responses[name] }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("saveTransactionBatch", () => {
  it("sends the request id to the idempotent RPC", async () => {
    const { client, rpc } = fakeClient({
      apply_transaction_batch_idempotent: { data: { created: 1, updated: 0, replayed: false } },
    });
    const result = await saveTransactionBatch(client, [row], [], "req-1");
    expect(result.created).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("apply_transaction_batch_idempotent");
    expect((rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_request_id: "req-1" });
  });

  it("surfaces a replayed result without writing again", async () => {
    const { client } = fakeClient({
      apply_transaction_batch_idempotent: { data: { created: 1, updated: 0, replayed: true } },
    });
    expect((await saveTransactionBatch(client, [row], [], "req-1")).replayed).toBe(true);
  });

  it("falls back to the original RPC only when the new function does not exist yet", async () => {
    const { client, rpc } = fakeClient({
      apply_transaction_batch_idempotent: { error: { code: "PGRST202", message: "not found" } },
      apply_transaction_batch: { data: { created: 1, updated: 0 } },
    });
    const result = await saveTransactionBatch(client, [row], [], "req-1");
    expect(result.created).toBe(1);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["apply_transaction_batch_idempotent", "apply_transaction_batch"]);
  });

  it("does not fall back on a real failure, so a conflict is never retried blindly", async () => {
    const { client, rpc } = fakeClient({
      apply_transaction_batch_idempotent: { error: { code: "P0001", message: "FINANCE_CONFLICT:abc" } },
    });
    await expect(saveTransactionBatch(client, [], [], "req-1")).rejects.toThrow("FINANCE_CONFLICT:abc");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
