"use client";

import { useState } from "react";
import { PageHeader } from "@/components/nav";
import { Banner, Button, Panel, ConfirmDialog, EmptyState, Field, Input, Select  } from "@/components/ui";
import { currentMonthKey, monthLabel } from "@/lib/dates";
import { budgetProgress } from "@/lib/finance";
import { formatMinor } from "@/lib/money";
import { useWorkspace } from "@/lib/store";
import { parseAmountInput } from "@/lib/parse";
import { deleteBudget, saveBudget } from "@/lib/supabase/data";

export function Budgets() {
  const { budgets, transactions, categories, currency, client, refresh, state, error, setupRequired } = useWorkspace();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [categoryId, setCategoryId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (setupRequired) return <Banner tone="error" title="Not configured:">{error}</Banner>;

  const progress = budgetProgress(budgets, transactions, month);
  const overall = progress.find((row) => row.budget.category_id === null) ?? null;
  const perCategory = progress.filter((row) => row.budget.category_id !== null);

  const submit = async () => {
    setFormError(null);
    const parsed = parseAmountInput(amountText);
    if (!parsed.ok) {
      setFormError(parsed.reason);
      return;
    }
    setBusy(true);
    try {
      await saveBudget(client!, { month, category_id: categoryId || null, amount: parsed.value.minor });
      setAmountText("");
      await refresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Budgets"
        description="Expenses only. Income and transfers never count against a budget."
        action={
          <Input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="w-auto"
            aria-label="Budget month"
          />
        }
      />

      <Panel title="Set a budget">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Scope">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Overall monthly budget</option>
              {categories.filter((category) => !category.archived).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.kind})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Amount (${currency})`}>
            <Input value={amountText} onChange={(event) => setAmountText(event.target.value)} placeholder="e.g. 3000000" />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" disabled={busy} onClick={() => void submit()}>
              Save budget
            </Button>
          </div>
        </div>
        {formError ? <p className="mt-2 text-xs text-[var(--negative)]">{formError}</p> : null}
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Budgets count expenses only. Income and transfers never count against a budget.
        </p>
      </Panel>

      {state === "loading" ? <p className="text-sm text-[var(--text-muted)]">Loading…</p> : null}
      {state === "error" ? <Banner tone="error" title="Could not load:">{error}</Banner> : null}

      {progress.length === 0 ? (
        <EmptyState title="No budgets for this month">
          Set an overall limit or a limit per category to see progress here.
        </EmptyState>
      ) : null}

      {overall ? (
        <Panel title={`Overall budget · ${monthLabel(month)}`}>
          <BudgetBar
            percentUsed={overall.percentUsed}
            level={overall.level}
            label={`${formatMinor(overall.spent, currency)} of ${formatMinor(overall.budget.amount, currency)}`}
            remaining={overall.remaining}
            currency={currency}
          />
        </Panel>
      ) : null}

      {perCategory.length > 0 ? (
        <Panel title="Category budgets">
          <ul className="flex flex-col gap-4">
            {perCategory.map((row) => (
              <li key={row.budget.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {categories.find((category) => category.id === row.budget.category_id)?.name ?? "Unknown"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tnum text-xs text-[var(--text-muted)]">
                      {formatMinor(row.spent, currency)} / {formatMinor(row.budget.amount, currency)}
                    </span>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete(row.budget.id)}>
                      Remove
                    </Button>
                  </span>
                </div>
                <BudgetBar
                  percentUsed={row.percentUsed}
                  level={row.level}
                  label={`${row.percentUsed.toFixed(0)}% used`}
                  remaining={row.remaining}
                  currency={currency}
                />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove this budget?"
        confirmLabel="Remove"
        message="Historical transactions are not affected."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const id = confirmDelete;
          setConfirmDelete(null);
          if (id && client) {
            void deleteBudget(client, id).then(() => refresh());
          }
        }}
      />
    </div>
  );
}

function BudgetBar({ percentUsed, level, label, remaining, currency }: {
  percentUsed: number;
  level: "ok" | "warning" | "over";
  label: string;
  remaining: number;
  currency: ReturnType<typeof useWorkspace>["currency"];
}) {
  const width = Math.min(100, Math.max(0, percentUsed));
  const color = level === "over" ? "var(--negative)" : level === "warning" ? "var(--warning)" : "var(--accent)";
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        {label} ·{" "}
        {remaining >= 0 ? `${formatMinor(remaining, currency)} remaining` : `${formatMinor(-remaining, currency)} over`}
        {level !== "ok" ? (
          <strong className="ml-1" style={{ color }}>
            {level === "over" ? "Over budget" : "At 80% of budget"}
          </strong>
        ) : null}
      </p>
    </div>
  );
}





