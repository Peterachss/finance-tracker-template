"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/nav";
import { Banner, Modal } from "@/components/ui";
import {
  BILL_SPEC,
  monthlyCost,
  nextDueDate,
  useCollection,
  type Bill,
  type BillCycle,
} from "@/lib/collections";
import { shortDayLabel, todayIso } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { activeAccounts, activeCategories, useWorkspace } from "@/lib/store";
import {
  Card,
  CollectionGate,
  FieldRow,
  Figure,
  inputClass,
  outlineButton,
  parseMoney,
  primaryButton,
} from "@/components/planning-ui";

const CYCLES: { id: BillCycle; label: string }[] = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Every 3 months" },
  { id: "yearly", label: "Yearly" },
];

type Draft = { id?: string; name: string; amount: string; cycle: BillCycle; next_due: string; category_id: string; account_id: string };

/** Subscriptions renew on their own: roll the stored date forward to the next renewal from today. */
function renewsOn(bill: Bill, today: string): string {
  let date = bill.next_due;
  for (let i = 0; date < today && i < 600; i++) date = nextDueDate(date, bill.cycle);
  return date;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Bills() {
  const bills = useCollection<Bill>({ ...BILL_SPEC });
  const { accounts, categories, transactions, currency } = useWorkspace();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const year = today.slice(0, 4);
  const money = (minor: number) => formatMinor(minor, currency, { symbol: true });

  const active = bills.rows.filter((b) => b.active).map((b) => ({ ...b, renews: renewsOn(b, today) })).sort((a, b) => monthlyCost(b) - monthlyCost(a));
  const perMonth = active.reduce((total, b) => total + monthlyCost(b), 0);
  const accountList = activeAccounts(accounts);
  const expenseCategories = activeCategories(categories).filter((c) => c.kind === "expense");

  // What actually left your accounts for subscriptions, month by month this year.
  const subsCategory = expenseCategories.find((c) => /subscription/i.test(c.name));
  const spentByMonth = MONTH_SHORT.map(() => 0);
  for (const t of transactions) {
    if (subsCategory && t.type === "expense" && t.category_id === subsCategory.id && t.date.startsWith(year)) spentByMonth[Number(t.date.slice(5, 7)) - 1] += t.amount;
  }
  const spentThisYear = spentByMonth.reduce((a, b) => a + b, 0);
  const monthsSoFar = Number(today.slice(5, 7));
  const maxMonth = Math.max(1, ...spentByMonth);

  const openNew = () =>
    setDraft({ name: "", amount: "", cycle: "monthly", next_due: today, category_id: subsCategory?.id ?? "", account_id: accountList[0]?.id ?? "" });

  const saveDraft = async () => {
    if (!draft) return;
    const amount = parseMoney(draft.amount);
    if (!draft.name.trim() || !amount) return setError("Add a name and an amount above zero.");
    setError(null);
    const values: Partial<Bill> = {
      name: draft.name.trim(),
      amount,
      cycle: draft.cycle,
      next_due: draft.next_due,
      category_id: draft.category_id || null,
      account_id: draft.account_id || null,
    };
    try {
      if (draft.id) await bills.update(draft.id, values);
      else await bills.insert(values);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <PageHeader
        title="Subscriptions"
        description="They renew by themselves until you cancel them. This page only shows what they cost you."
        action={<button type="button" onClick={openNew} className={primaryButton}><Plus className="size-4" strokeWidth={2} />Add subscription</button>}
      />
      {error ? <Banner tone="error">{error}</Banner> : null}

      <CollectionGate states={[bills.state]} errors={[bills.error]}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card title="What they cost">
            <div className="grid grid-cols-2 gap-5 xl:grid-cols-4 xl:divide-x xl:divide-[var(--line)]">
              <Figure label="Per month" value={money(perMonth)} caption={`${active.length} active`} />
              <div className="xl:pl-5"><Figure label="Per year" value={money(perMonth * 12)} caption="If nothing changes" /></div>
              <div className="xl:pl-5"><Figure label={`Spent in ${year}`} value={money(spentThisYear)} caption="Subscriptions category" /></div>
              <div className="xl:pl-5"><Figure label="Average a month" value={money(Math.round(spentThisYear / monthsSoFar))} caption={`Jan to ${MONTH_SHORT[monthsSoFar - 1]}`} /></div>
            </div>
          </Card>

          <Card title={`Spent each month, ${year}`}>
            <dl className="divide-y divide-[var(--line)] text-[14px]">
              {spentByMonth.slice(0, monthsSoFar).map((amount, i) => (
                <div key={MONTH_SHORT[i]} className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-2">
                  <dt className="text-[var(--text-muted)]">{MONTH_SHORT[i]}</dt>
                  <span aria-hidden="true" className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, (amount / maxMonth) * 100)}%`, opacity: amount ? 1 : 0.25 }} />
                  <dd className="tnum font-medium">{money(amount)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>

        <Card title="Your subscriptions">
          {active.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[15px] font-medium">No subscriptions yet</p>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">Add Spotify, Claude, iCloud… to see what they cost each month.</p>
              <button type="button" onClick={openNew} className={`${outlineButton} mt-4`}><Plus className="size-4" />Add a subscription</button>
            </div>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[14px]">
                <thead>
                  <tr className="bg-[var(--surface-sunken)] text-left text-[12px] text-[var(--text-muted)]">
                    <th className="px-5 py-2.5 font-medium">Subscription</th>
                    <th className="px-3 py-2.5 font-medium">Charged</th>
                    <th className="px-3 py-2.5 font-medium">Renews</th>
                    <th className="px-3 py-2.5 text-right font-medium">Price</th>
                    <th className="px-3 py-2.5 text-right font-medium">Per month</th>
                    <th className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {active.map((bill) => (
                    <tr key={bill.id}>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-3">
                          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[13px] font-semibold text-[var(--accent)]">
                            {bill.name.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{bill.name}</span>
                            {bill.notes ? <span className="block truncate text-[12px] text-[var(--text-faint)]">{bill.notes}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-[var(--text-muted)]">{CYCLES.find((c) => c.id === bill.cycle)?.label}</td>
                      <td className="px-3 py-3.5 text-[var(--text-muted)]">{shortDayLabel(bill.renews)}</td>
                      <td className="tnum px-3 py-3.5 text-right">{money(bill.amount)}</td>
                      <td className="tnum px-3 py-3.5 text-right font-medium">{money(monthlyCost(bill))}</td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Edit ${bill.name}`}
                            onClick={() => setDraft({
                              id: bill.id, name: bill.name, amount: String(bill.amount / 100), cycle: bill.cycle,
                              next_due: bill.renews, category_id: bill.category_id ?? "", account_id: bill.account_id ?? "",
                            })}
                            className="grid size-9 place-items-center rounded-[8px] text-[var(--text-faint)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
                          >
                            <Pencil className="size-4" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Cancelled ${bill.name}, remove it`}
                            title="Cancelled it? Remove it from the list"
                            onClick={() => { if (confirm(`Cancelled ${bill.name}? Remove it from the list.`)) void bills.update(bill.id, { active: false }); }}
                            className="grid size-9 place-items-center rounded-[8px] text-[var(--text-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--negative)]"
                          >
                            <Trash2 className="size-4" strokeWidth={1.75} />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--line-strong)]">
                    <td className="px-5 py-3 font-medium" colSpan={4}>Total per month</td>
                    <td className="tnum px-3 py-3 text-right font-semibold">{money(perMonth)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </CollectionGate>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit subscription" : "Add subscription"}
        footer={<button type="button" className={primaryButton} onClick={() => void saveDraft()}>Save</button>}
      >
        {draft ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldRow label="Name">
              <input className={inputClass} value={draft.name} placeholder="Spotify" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </FieldRow>
            <FieldRow label={`Amount (${currency})`}>
              <input className={inputClass} inputMode="decimal" value={draft.amount} placeholder="59k" onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </FieldRow>
            <FieldRow label="Repeats">
              <select className={inputClass} value={draft.cycle} onChange={(e) => setDraft({ ...draft, cycle: e.target.value as BillCycle })}>
                {CYCLES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Renews on">
              <input className={inputClass} type="date" value={draft.next_due} onChange={(e) => setDraft({ ...draft, next_due: e.target.value })} />
            </FieldRow>
            <FieldRow label="Category">
              <select className={inputClass} value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}>
                <option value="">No category</option>
                {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Paid from">
              <select className={inputClass} value={draft.account_id} onChange={(e) => setDraft({ ...draft, account_id: e.target.value })}>
                {accountList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FieldRow>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
