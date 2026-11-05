"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/nav";
import { Banner, Modal } from "@/components/ui";
import {
  CONTRIBUTION_SPEC,
  GOAL_SPEC,
  useCollection,
  type Goal,
  type GoalContribution,
} from "@/lib/collections";
import { shortDayLabel, todayIso } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { useWorkspace } from "@/lib/store";
import { Card, CollectionGate, FieldRow, Figure, inputClass, outlineButton, parseMoney, primaryButton } from "@/components/planning-ui";

/** One dream: progress, add or take out money, history. */
function GoalCard({ goal, saved, history, onAdd, onDelete, onAchieved }: {
  goal: Goal;
  saved: number;
  history: GoalContribution[];
  onAdd: (amount: number, note: string) => Promise<void>;
  onDelete: () => void;
  onAchieved: () => void;
}) {
  const { currency } = useWorkspace();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pct = Math.min(100, Math.round((saved / goal.target) * 100));
  const left = Math.max(0, goal.target - saved);
  const money = (minor: number) => formatMinor(minor, currency, { symbol: true });

  const submit = async (direction: 1 | -1) => {
    const minor = parseMoney(amount);
    if (!minor) return setError("Type an amount like 500k or 1tr.");
    if (direction === -1 && minor > saved) return setError("You cannot take out more than is saved.");
    setBusy(true);
    setError(null);
    try {
      await onAdd(minor * direction, direction === 1 ? "Saved" : "Taken out");
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
            {goal.name}
            {/^https?:\/\//i.test(goal.link) ? (
              <a href={goal.link} target="_blank" rel="noreferrer" aria-label="Open product page" className="text-[var(--text-faint)] hover:text-[var(--text)]">
                <ExternalLink className="size-4" strokeWidth={1.75} />
              </a>
            ) : null}
          </span>
          {goal.achieved ? <span className="mt-1 inline-block rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[12px] font-medium text-[var(--accent)]">Bought</span> : null}
        </span>
      }
      action={
        <span className="flex gap-1">
          {!goal.achieved && saved >= goal.target ? (
            <button type="button" onClick={onAchieved} className={`${outlineButton} h-9 px-3`}><Check className="size-4" />Mark bought</button>
          ) : null}
          <button type="button" aria-label={`Delete ${goal.name}`} onClick={onDelete} className="grid size-9 place-items-center rounded-[8px] text-[var(--text-faint)] hover:bg-[var(--danger-soft)] hover:text-[var(--negative)]">
            <Trash2 className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Figure label="Saved" value={money(saved)} />
        <Figure label="Goal" value={money(goal.target)} />
        <Figure label="Still need" value={money(left)} tone={left === 0 ? "positive" : "accent"} />
      </div>
      <div
        role="progressbar"
        aria-label={`${goal.name} saved`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
      >
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="tnum mt-2 text-[13px] text-[var(--text-muted)]">{pct}% there</p>

      {!goal.achieved ? (
        <form className="mt-5 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void submit(1); }}>
          <label className="sr-only" htmlFor={`amt-${goal.id}`}>Amount</label>
          <input id={`amt-${goal.id}`} className={`${inputClass} basis-full sm:max-w-[220px] sm:basis-auto sm:flex-1`} inputMode="decimal" placeholder="500k" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="submit" disabled={busy} className={primaryButton}><Plus className="size-4" />Put money in</button>
          <button type="button" disabled={busy} onClick={() => void submit(-1)} className={outlineButton}>Take out</button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-[var(--negative)]">{error}</p> : null}

      {history.length ? (
        <ul className="mt-5 divide-y divide-[var(--line)] border-t border-[var(--line)] text-[14px]">
          {history.slice(-6).reverse().map((c) => (
            <li key={c.id} className="flex justify-between py-2">
              <span className="text-[var(--text-muted)]">{shortDayLabel(c.tx_date)} · {c.note || (c.amount > 0 ? "Saved" : "Taken out")}</span>
              <span className={`tnum font-medium ${c.amount > 0 ? "text-[var(--positive)]" : ""}`}>{c.amount > 0 ? "+" : ""}{money(c.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}


export function Goals() {
  const goals = useCollection<Goal>({ ...GOAL_SPEC });
  const contributions = useCollection<GoalContribution>({ ...CONTRIBUTION_SPEC });
  const { currency } = useWorkspace();
  const [draft, setDraft] = useState<{ name: string; target: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedBy = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contributions.rows) map.set(c.goal_id, (map.get(c.goal_id) ?? 0) + c.amount);
    return map;
  }, [contributions.rows]);
  const totalSaved = [...savedBy.values()].reduce((a, b) => a + b, 0);
  const totalTarget = goals.rows.filter((g) => !g.achieved).reduce((a, g) => a + g.target, 0);

  const create = async () => {
    if (!draft) return;
    const target = parseMoney(draft.target);
    if (!draft.name.trim() || !target) return setError("Add a name and a price.");
    try {
      await goals.insert({ name: draft.name.trim(), target, link: draft.link.trim() });
      setDraft(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <PageHeader
        title="Dream list"
        description="Things you are saving up for. Put money in whenever you can; it shows how close you are."
        action={<button type="button" className={primaryButton} onClick={() => setDraft({ name: "", target: "", link: "" })}><Plus className="size-4" />New dream</button>}
      />
      <CollectionGate states={[goals.state, contributions.state]} errors={[goals.error, contributions.error]}>
        <Card>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Figure label="Saved across dreams" value={formatMinor(totalSaved, currency, { symbol: true })} />
            <Figure label="Still to save" value={formatMinor(Math.max(0, totalTarget - totalSaved), currency, { symbol: true })} />
            <Figure label="Dreams" value={String(goals.rows.length)} caption={`${goals.rows.filter((g) => g.achieved).length} bought`} />
          </div>
        </Card>

        {goals.rows.length === 0 ? (
          <Card>
            <div className="py-8 text-center">
              <p className="text-[15px] font-medium">Nothing on the list yet</p>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">Add a camera, a trip, anything with a price.</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {goals.rows.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                saved={savedBy.get(goal.id) ?? 0}
                history={contributions.rows.filter((c) => c.goal_id === goal.id)}
                onAdd={(amount, note) => contributions.insert({ goal_id: goal.id, amount, note, tx_date: todayIso() })}
                onDelete={() => { if (confirm(`Delete ${goal.name} and its history?`)) void goals.remove(goal.id).then(contributions.reload); }}
                onAchieved={() => void goals.update(goal.id, { achieved: true })}
              />
            ))}
          </div>
        )}
      </CollectionGate>

      <Modal open={draft !== null} onClose={() => setDraft(null)} title="New dream" footer={<button type="button" className={primaryButton} onClick={() => void create()}>Add to list</button>}>
        {draft ? (
          <div className="grid gap-4">
            {error ? <Banner tone="error">{error}</Banner> : null}
            <FieldRow label="What is it?">
              <input className={inputClass} placeholder="New laptop" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </FieldRow>
            <FieldRow label={`Price (${currency})`}>
              <input className={inputClass} inputMode="decimal" placeholder="32.9tr" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
            </FieldRow>
            <FieldRow label="Link (optional)">
              <input className={inputClass} type="url" placeholder="https://" value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} />
            </FieldRow>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
