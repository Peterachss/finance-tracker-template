"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/nav";
import { Banner, Modal } from "@/components/ui";
import { openQuickAdd } from "@/components/QuickAdd";
import { BUCKET_SPEC, CONTRIBUTION_SPEC, useCollection, type Bucket, type GoalContribution } from "@/lib/collections";
import { DEMO_ENABLED } from "@/lib/demo";
import { currentMonthKey, monthLabel, monthRange, todayIso } from "@/lib/dates";
import { categoryName } from "@/lib/finance";
import { formatMinor } from "@/lib/money";
import { activeAccounts, activeCategories, useWorkspace } from "@/lib/store";
import { saveCategory } from "@/lib/supabase/data";
import { MonthSwitcher, SheetFrame, SheetMoney, SheetTitle, sheetCell, sheetHeadGreen, sheetLetter, sheetNum, sheetTotal } from "@/components/sheet";
import { Card, CollectionGate, FieldRow, inputClass, outlineButton, parseMoney, primaryButton } from "@/components/planning-ui";

/** Forest family, darkest first, so the split bar reads as one palette. */
const JAR_COLOURS = ["#1f5c46", "#3d8b6a", "#7cc0a0", "#b9dfa0", "#f3f68c", "#d7e8df"];

/** A starter split for a 5M-a-month budget. Change the jars after setting it up. */
const MY_PLAN: { name: string; amount: number; category: string | null; saving?: boolean }[] = [
  { name: "Food", amount: 200_000_000, category: "Food" },
  { name: "Transport", amount: 50_000_000, category: "Transport" },
  { name: "Subscriptions", amount: 50_000_000, category: "Subscriptions" },
  { name: "Savings", amount: 200_000_000, category: null, saving: true },
];

export function Allowance() {
  const buckets = useCollection<Bucket>({ ...BUCKET_SPEC });
  const contributions = useCollection<GoalContribution>({ ...CONTRIBUTION_SPEC });
  const { client, transactions, categories, accounts, currency, refresh, commitBatch } = useWorkspace();
  const [editing, setEditing] = useState<{ id?: string; name: string; amount: string; category_id: string; is_saving: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => currentMonthKey());
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const money = (minor: number) => formatMinor(minor, currency, { symbol: true });

  const total = buckets.rows.reduce((a, b) => a + b.amount, 0);
  const monthExpenses = useMemo(
    () => transactions.filter((t) => t.type === "expense" && t.date >= monthStart && t.date < monthEnd),
    [transactions, monthStart, monthEnd],
  );
  const received = transactions
    .filter((t) => t.type === "income" && t.date >= monthStart && t.date < monthEnd)
    .reduce((a, t) => a + t.amount, 0);
  const linked = new Set(buckets.rows.map((b) => b.category_id).filter(Boolean));
  const savedThisMonth = contributions.rows
    .filter((c) => c.tx_date >= monthStart && c.tx_date < monthEnd)
    .reduce((a, c) => a + c.amount, 0);

  /** Spent from a jar: its category, or for a catch-all jar every unlinked expense. */
  const usedBy = (b: Bucket) => {
    if (b.is_saving) return savedThisMonth;
    if (b.category_id) return monthExpenses.filter((t) => t.category_id === b.category_id).reduce((a, t) => a + t.amount, 0);
    return monthExpenses.filter((t) => !t.category_id || !linked.has(t.category_id)).reduce((a, t) => a + t.amount, 0);
  };
  const spentTotal = buckets.rows.filter((b) => !b.is_saving).reduce((a, b) => a + usedBy(b), 0);
  const spendable = buckets.rows.filter((b) => !b.is_saving).reduce((a, b) => a + b.amount, 0);
  const daysLeft = Math.max(1, Math.round((Date.parse(monthEnd) - Date.parse(todayIso())) / 86_400_000));
  const perDay = Math.max(0, Math.floor((spendable - spentTotal) / daysLeft / 100) * 100);

  /** Creates the five jars, adding any missing categories first. */
  const applyPlan = async () => {
    setBusy(true);
    setError(null);
    try {
      let cats = categories;
      if (!DEMO_ENABLED && client) {
        for (const name of new Set(MY_PLAN.map((p) => p.category).filter(Boolean) as string[])) {
          if (!cats.some((c) => c.kind === "expense" && c.name.toLowerCase() === name.toLowerCase())) {
            await saveCategory(client, { name, kind: "expense" });
          }
        }
        cats = (await refresh())?.categories ?? cats;
      }
      for (const [i, p] of MY_PLAN.entries()) {
        const category = p.category ? cats.find((c) => c.kind === "expense" && c.name.toLowerCase() === p.category!.toLowerCase()) : null;
        await buckets.insert({ name: p.name, amount: p.amount, category_id: category?.id ?? null, is_saving: Boolean(p.saving), sort: i });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Logs this month's allowance as income in one tap. */
  const logAllowance = async () => {
    const account = activeAccounts(accounts)[0];
    if (!account) return setError("Add an account in Settings first.");
    const allowanceCategory = categories.find((c) => c.kind === "income" && /allowance/i.test(c.name));
    setBusy(true);
    try {
      await commitBatch(
        [{ date: todayIso(), description: `Allowance · ${monthLabel(month)}`, type: "income", category_id: allowanceCategory?.id ?? null, account_id: account.id, to_account_id: null, amount: total, notes: "" }],
        [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveJar = async () => {
    if (!editing) return;
    const amount = parseMoney(editing.amount);
    if (!editing.name.trim() || !amount) return setError("Give the jar a name and an amount.");
    const values = { name: editing.name.trim(), amount, category_id: editing.category_id || null, is_saving: editing.is_saving };
    try {
      if (editing.id) await buckets.update(editing.id, values);
      else await buckets.insert({ ...values, sort: buckets.rows.length });
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <PageHeader
        title="Monthly allowance"
        description="Your monthly money, split into jars. Spending in a jar's category comes out of that jar automatically."
        action={buckets.rows.length ? <button type="button" className={outlineButton} onClick={() => setEditing({ name: "", amount: "", category_id: "", is_saving: false })}><Plus className="size-4" />Add jar</button> : null}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}

      <CollectionGate states={[buckets.state, contributions.state]} errors={[buckets.error, contributions.error]}>
        {buckets.rows.length === 0 ? (
          <Card>
            <div className="py-6 text-center">
              <p className="text-[17px] font-semibold">Set up your jars</p>
              <p className="mx-auto mt-1 max-w-[46ch] text-[14px] text-[var(--text-muted)]">
                A starter plan for 5M a month: 2M food, 500k transport, 500k subscriptions, 2M savings.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" disabled={busy} onClick={() => void applyPlan()} className={primaryButton}>{busy ? "Setting up…" : "Use this plan"}</button>
                <button type="button" onClick={() => setEditing({ name: "", amount: "", category_id: "", is_saving: false })} className={outlineButton}>Start empty</button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <SheetTitle
              title={`Monthly Allowance · ${monthLabel(month)}`}
              subtitle="Each jar's spending comes from its category in your transactions"
              action={<MonthSwitcher month={month} onChange={setMonth} />}
            />
            <SheetFrame label={`Allowance ${monthLabel(month)}`}>
              <colgroup>
                <col style={{ width: 40 }} />
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr aria-hidden="true">
                  <th className={sheetLetter} />
                  {["A", "B", "C", "D"].map((l) => <th key={l} className={sheetLetter}>{l}</th>)}
                </tr>
                <tr>
                  <th className={sheetNum}>1</th>
                  <th className={sheetHeadGreen}>Jar</th>
                  <th className={`${sheetHeadGreen} text-right`}>Planned</th>
                  <th className={`${sheetHeadGreen} text-right`}>Spent</th>
                  <th className={`${sheetHeadGreen} text-right`}>Left</th>
                </tr>
              </thead>
              <tbody>
                {buckets.rows.map((b, i) => {
                  const used = usedBy(b);
                  const left = b.amount - used;
                  return (
                    <tr key={b.id}>
                      <td className={sheetNum}>{i + 2}</td>
                      <td className={sheetCell}>
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: JAR_COLOURS[i % JAR_COLOURS.length] }} />
                          {b.name}
                          {b.is_saving ? <span className="text-[11px] text-[var(--text-faint)]">saved</span> : null}
                        </span>
                      </td>
                      <td className={sheetCell}><SheetMoney minor={b.amount} currency={currency} /></td>
                      <td className={sheetCell}><SheetMoney minor={used} currency={currency} /></td>
                      <td className={sheetCell} style={!b.is_saving && left < 0 ? { background: "#e6a5a5", color: "#111816" } : undefined}>
                        <SheetMoney minor={b.is_saving ? b.amount - used : left} currency={currency} />
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className={sheetNum}>{buckets.rows.length + 2}</td>
                  <td className={sheetTotal}>Total</td>
                  <td className={sheetTotal}><SheetMoney minor={total} currency={currency} bold /></td>
                  <td className={sheetTotal}><SheetMoney minor={buckets.rows.reduce((a, b) => a + usedBy(b), 0)} currency={currency} bold /></td>
                  <td className={sheetTotal}><SheetMoney minor={total - buckets.rows.reduce((a, b) => a + usedBy(b), 0)} currency={currency} bold /></td>
                </tr>
                <tr>
                  <td className={sheetNum}>{buckets.rows.length + 3}</td>
                  <td className={sheetTotal}>Received this month</td>
                  <td className={sheetTotal}><SheetMoney minor={received} currency={currency} bold /></td>
                  <td className={sheetTotal} />
                  <td className={sheetTotal} />
                </tr>
              </tbody>
            </SheetFrame>

            {/* Hero: the month at a glance, with the split bar under it. */}
            <section className="rounded-[24px] bg-[var(--accent)] p-6 text-[var(--on-accent)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[14px] opacity-80">{monthLabel(month)} · {money(total)} plan</p>
                  <p className="tnum mt-1 text-[34px] font-bold tracking-[-0.03em]">{money(spendable - spentTotal)}</p>
                  <p className="text-[14px] opacity-80">left to spend · about <span className="tnum font-semibold opacity-100">{money(perDay)}</span> a day for {daysLeft} days</p>
                </div>
                <button type="button" disabled={busy} onClick={() => void logAllowance()} className="h-10 rounded-full bg-[var(--lime)] px-4 text-[14px] font-medium text-[#111816] disabled:opacity-60">
                  {received >= total ? "Allowance received ✓" : `Got ${money(total)}`}
                </button>
              </div>
              <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
                {buckets.rows.map((b, i) => (
                  <span key={b.id} style={{ width: `${(b.amount / Math.max(1, total)) * 100}%`, background: JAR_COLOURS[i % JAR_COLOURS.length] === "#1f5c46" ? "#0f3a2b" : JAR_COLOURS[i % JAR_COLOURS.length] }} />
                ))}
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {buckets.rows.map((b, i) => {
                const used = usedBy(b);
                const left = b.amount - used;
                const pct = Math.min(100, Math.round((used / b.amount) * 100));
                const over = !b.is_saving && left < 0;
                return (
                  <article key={b.id} className="flex flex-col rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="size-3 rounded-full" style={{ background: JAR_COLOURS[i % JAR_COLOURS.length] }} />
                        <span className="text-[15px] font-semibold">{b.name}</span>
                      </span>
                      <span className="flex">
                        <button type="button" aria-label={`Edit ${b.name}`} onClick={() => setEditing({ id: b.id, name: b.name, amount: String(b.amount / 100), category_id: b.category_id ?? "", is_saving: b.is_saving })} className="grid size-8 place-items-center rounded-[8px] text-[var(--text-faint)] hover:bg-[var(--surface-sunken)]">
                          <Pencil className="size-3.5" strokeWidth={1.75} />
                        </button>
                        <button type="button" aria-label={`Delete ${b.name}`} onClick={() => { if (confirm(`Delete the ${b.name} jar?`)) void buckets.remove(b.id); }} className="grid size-8 place-items-center rounded-[8px] text-[var(--text-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--negative)]">
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                        </button>
                      </span>
                    </div>
                    <p className={`tnum mt-4 text-[24px] font-semibold tracking-[-0.02em] ${over ? "text-[var(--negative)]" : ""}`}>
                      {b.is_saving ? money(used) : money(left)}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)]">
                      {b.is_saving ? `saved of ${money(b.amount)}` : over ? `over by ${money(-left)}` : `left of ${money(b.amount)}`}
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--negative)" : "var(--accent)" }} />
                    </div>
                    <p className="mt-3 text-[12px] text-[var(--text-faint)]">
                      {b.is_saving ? "Counts money put into the Dream list" : b.category_id ? `Category: ${categoryName(categories, b.category_id)}` : "Catches every other expense"}
                    </p>
                    {!b.is_saving ? (
                      <button type="button" onClick={() => openQuickAdd("expense")} className="mt-3 self-start text-[13px] font-medium text-[var(--accent)] hover:underline">
                        + Log spending
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </CollectionGate>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit jar" : "New jar"} footer={<button type="button" className={primaryButton} onClick={() => void saveJar()}>Save</button>}>
        {editing ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldRow label="Name"><input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></FieldRow>
            <FieldRow label="Amount per month"><input className={inputClass} inputMode="decimal" placeholder="2tr" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /></FieldRow>
            <FieldRow label="Spending category">
              <select className={inputClass} value={editing.category_id} disabled={editing.is_saving} onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}>
                <option value="">Everything not in another jar</option>
                {activeCategories(categories).filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FieldRow>
            <label className="flex items-center gap-2 self-end pb-3 text-[14px]">
              <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={editing.is_saving} onChange={(e) => setEditing({ ...editing, is_saving: e.target.checked, category_id: "" })} />
              Savings jar
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
