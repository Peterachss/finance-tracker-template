"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, Delete, MessageSquareText, Plus } from "lucide-react";
import { todayIso } from "@/lib/dates";
import { totalBalance } from "@/lib/finance";
import { CURRENCIES, decimalStringToMinor, formatMinor } from "@/lib/money";
import { activeAccounts, activeCategories, useWorkspace } from "@/lib/store";


type Kind = "expense" | "income" | "transfer";
const EVENT = "ft-quick-add";
const TITLE: Record<Kind, string> = { expense: "Pay", income: "Receive", transfer: "Transfer" };
const ACTION: Record<Kind, string> = { expense: "Save payment", income: "Save income", transfer: "Move money" };
/** One-tap Pay shortcuts, e.g. { label: "Coffee · 45k", note: "Coffee", category: "Food", amount: 45000 }. Leave out amount when the price varies. */
const QUICK: { label: string; note: string; category: string; amount?: number }[] = [];

/** Opens the keypad from anywhere (home actions, tab bar, empty states). */
export function openQuickAdd(kind: Kind = "expense") {
  window.dispatchEvent(new CustomEvent<Kind>(EVENT, { detail: kind }));
}

const key = "h-[52px] rounded-[14px] bg-[var(--surface-sunken)] text-[22px] font-medium active:bg-[var(--line-strong)]";

/**
 * Money entry modelled on the Nixtio "Pay" screen, in forest green: account
 * pill, a "what / to whom" row with Change, the big amount, balance, note,
 * keypad and one wide button. Full screen on a phone, a floating card on a
 * laptop (where the number keys work too). Saves through the same
 * idempotent batch as the spreadsheet.
 */
export function QuickAdd() {
  const { accounts, categories, transactions, currency, commitBatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("expense");
  const [kindMenu, setKindMenu] = useState(false);
  const [digits, setDigits] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState("");
  // When it happened: today unless changed, so a missed payment can be logged later.
  const [date, setDate] = useState(() => todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decimals = CURRENCIES[currency].decimals > 0;
  const accountList = activeAccounts(accounts);
  const account = accountList.find((a) => a.id === accountId) ?? accountList[0];
  const others = accountList.filter((a) => a.id !== account?.id);
  const toAccount = others.find((a) => a.id === toAccountId) ?? others[0];
  const categoryList = activeCategories(categories).filter((c) => c.kind === (kind === "income" ? "income" : "expense"));
  const category = categoryList.find((c) => c.id === categoryId);

  let minor = 0;
  try {
    const clean = digits.endsWith(".") ? digits.slice(0, -1) : digits;
    minor = clean ? decimalStringToMinor(clean) : 0;
  } catch {
    minor = 0;
  }

  const press = useCallback((k: string) => {
    setError(null);
    if (k === "del") return setDigits((d) => d.slice(0, -1));
    if (k === ".") return setDigits((d) => (d.includes(".") ? d : (d || "0") + "."));
    setDigits((d) => {
      const next = d === "0" ? k : d + k;
      return /^\d{1,12}(\.\d{0,2})?$/.test(next) ? next : d;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setKindMenu(false);
    setPicking(false);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<Kind>).detail;
      setKind(detail === "income" || detail === "transfer" ? detail : "expense");
      setCategoryId("");
      setError(null);
      setPicking(false);
      // Always start on Bank transfer (bank accounts are listed first).
      setAccountId("");
      setDate(todayIso());
      setOpen(true);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const save = async () => {
    if (!account) return setError("Add an account first.");
    if (minor <= 0) return setError("Type an amount.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Pick a date.");
    if (kind === "transfer" && !toAccount) return setError("A transfer needs a second account.");
    setBusy(true);
    setError(null);
    try {
      const label = kind === "transfer" ? `To ${toAccount!.name}` : category?.name ?? (kind === "income" ? "Money in" : "Money out");
      await commitBatch(
        [{
          date,
          description: note.trim() || label,
          type: kind,
          category_id: kind === "transfer" ? null : category?.id ?? null,
          account_id: account.id,
          to_account_id: kind === "transfer" ? toAccount!.id : null,
          amount: minor,
          notes: "",
        }],
        [],
      );
      setDigits("");
      setNote("");
      setCategoryId("");
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Laptop keyboard: digits, dot, Backspace, Enter, Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT") {
        if (event.key === "Escape") close();
        return;
      }
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if ((event.key === "." || event.key === ",") && decimals) press(".");
      else if (event.key === "Backspace") press("del");
      else if (event.key === "Escape") close();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, press, close, decimals]);

  const who =
    kind === "transfer"
      ? { initial: toAccount?.name[0] ?? "?", name: toAccount ? `To ${toAccount.name}` : "No second account", sub: "Between your own accounts" }
      : {
          initial: category?.name[0] ?? (kind === "income" ? "+" : "−"),
          name: category?.name ?? "No category",
          sub: category ? `${kind === "income" ? "Into" : "From"} ${account?.name ?? "—"}` : "Tap Change to pick one",
        };

  return (
    <>
      {/* Laptop only: a round + in the corner. The phone uses the home actions. */}
      <button
        type="button"
        onClick={() => openQuickAdd("expense")}
        aria-label="Add money"
        className="fixed bottom-8 right-8 z-40 hidden size-14 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_12px_28px_-10px_rgb(17_24_22/0.6)] transition-transform hover:scale-105 active:scale-95 md:flex"
      >
        <Plus className="size-6" strokeWidth={2} aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-center bg-gradient-to-b from-[var(--mint)] to-[var(--mint-2)] sm:items-center sm:bg-none sm:bg-[rgb(17_24_22/0.4)] sm:p-4 sm:backdrop-blur-[2px]"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={TITLE[kind]}
            className="flex h-full w-full max-w-[430px] flex-col overflow-y-auto px-3 sm:h-auto sm:max-h-[94dvh] sm:rounded-[36px] sm:bg-gradient-to-b sm:from-[var(--mint)] sm:to-[var(--mint-2)]"
            style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <header className="relative flex h-14 shrink-0 items-center justify-between px-1">
              <button type="button" onClick={close} aria-label="Close" className="grid size-10 place-items-center rounded-full text-[var(--text)] hover:bg-black/5">
                <ChevronLeft className="size-6" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setKindMenu((m) => !m)}
                aria-expanded={kindMenu}
                aria-label={`${TITLE[kind]}, change type`}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[17px] font-medium hover:bg-black/5"
              >
                {TITLE[kind]}
                <ChevronDown className="size-4 text-[var(--text-muted)]" strokeWidth={2} />
              </button>
              <span className="size-10" aria-hidden="true" />
              {kindMenu ? (
                <ul className="absolute left-1/2 top-12 z-10 w-44 -translate-x-1/2 rounded-[16px] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-pop)]">
                  {(["income", "expense"] as const).map((k) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => { setKind(k); setKindMenu(false); setCategoryId(""); setPicking(false); }}
                        className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[15px] hover:bg-[var(--surface-sunken)]"
                      >
                        {TITLE[k]}
                        {kind === k ? <Check className="size-4 text-[var(--accent)]" strokeWidth={2.5} /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </header>

            <div className="flex flex-1 flex-col rounded-[32px] bg-[var(--surface)] px-5 pb-5 pt-6 shadow-[0_20px_40px_-24px_rgb(17_24_22/0.35)]">
              {/* How you paid: Bank transfer or Cash as two pills; a dropdown when there are many accounts. */}
              {accountList.length > 1 && accountList.length <= 3 && kind !== "transfer" ? (
                <div role="radiogroup" aria-label="Paid with" className="mx-auto flex rounded-full bg-[var(--surface-sunken)] p-1">
                  {accountList.map((a) => {
                    const selected = a.id === account?.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAccountId(a.id)}
                        className={`h-9 rounded-full px-4 text-[14px] font-medium transition-colors ${
                          selected ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
              <div className="relative mx-auto">
                <label htmlFor="qa-account" className="sr-only">{kind === "transfer" ? "From account" : "Account"}</label>
                <select
                  id="qa-account"
                  value={account?.id ?? ""}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="h-10 appearance-none rounded-full bg-[var(--accent)] pl-4 pr-9 text-[14px] font-medium text-[var(--on-accent)]"
                >
                  {accountList.length === 0 ? <option value="">No account yet</option> : null}
                  {accountList.map((a) => <option key={a.id} value={a.id}>{kind === "transfer" ? `From ${a.name}` : a.name}</option>)}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--on-accent)]" strokeWidth={2} />
              </div>
              )}

              {/* One-tap favourites: fill in the category, note and (when fixed) the price. */}
              {kind === "expense" && QUICK.length > 0 ? (
                <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5" aria-label="Quick add">
                  {QUICK.map((q) => {
                    const cat = categoryList.find((c) => c.name.toLowerCase() === q.category.toLowerCase());
                    const on = note === q.note && (!cat || categoryId === cat.id);
                    return (
                      <button
                        key={q.note}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setError(null);
                          setNote(q.note);
                          if (cat) setCategoryId(cat.id);
                          setDigits(q.amount ? String(q.amount) : "");
                        }}
                        className={`shrink-0 rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors ${
                          on ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"
                        }`}
                      >
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* The reference's "recipient · Change" row: here the category, or the account money moves to. */}
              <div className="mt-5 flex items-center gap-3">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[16px] font-semibold text-[var(--accent)]">
                  {who.initial.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{who.name}</span>
                  <span className="block truncate text-[12px] text-[var(--text-muted)]">{who.sub}</span>
                </span>
                <button type="button" onClick={() => setPicking((p) => !p)} className="text-[15px] text-[var(--text-muted)] hover:text-[var(--accent)]">
                  {picking ? "Done" : "Change"}
                </button>
              </div>
              {picking ? (
                <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label={kind === "transfer" ? "To account" : "Category"}>
                  {(kind === "transfer" ? others : categoryList).map((item) => {
                    const selected = kind === "transfer" ? item.id === toAccount?.id : item.id === categoryId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => { if (kind === "transfer") setToAccountId(item.id); else setCategoryId(selected ? "" : item.id); }}
                        className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] transition-colors ${
                          selected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--line-strong)] text-[var(--text-muted)]"
                        }`}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                  {kind === "transfer" && others.length === 0 ? (
                    <span className="text-[13px] text-[var(--text-muted)]">Add a second account on the website first.</span>
                  ) : null}
                </div>
              ) : null}

              <p className="tnum mt-auto pt-8 text-center text-[46px] font-bold leading-none tracking-[-0.035em]" aria-live="polite">
                {formatMinor(minor, currency, { symbol: true })}
              </p>
              <p className="tnum mt-3 text-center text-[14px] text-[var(--text-muted)]">
                {account ? `Balance: ${formatMinor(totalBalance(accounts, transactions), currency, { symbol: true })}` : "Add an account first"}
              </p>

              <div className="mt-8 flex gap-2">
              <label className="flex shrink-0 items-center gap-2 rounded-[14px] bg-[var(--surface-sunken)] px-3.5">
                <CalendarDays aria-hidden="true" className="size-4 text-[var(--text-faint)]" strokeWidth={1.75} />
                <span className="sr-only">Date</span>
                <input
                  type="date"
                  value={date}
                  max={todayIso()}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-12 w-[8.5rem] bg-transparent text-[15px] outline-none"
                />
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[14px] bg-[var(--surface-sunken)] px-3.5">
                <MessageSquareText aria-hidden="true" className="size-4 text-[var(--text-faint)]" strokeWidth={1.75} />
                <span className="sr-only">Note</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
                  placeholder="Note"
                  className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--text-faint)]"
                />
              </label>
              </div>

              {error ? <p role="alert" className="mt-3 text-center text-[13px] text-[var(--negative)]">{error}</p> : null}

              <div className="mt-4 grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                  <button key={k} type="button" onClick={() => press(k)} className={key}>{k}</button>
                ))}
                {decimals ? (
                  <button type="button" onClick={() => press(".")} aria-label="Decimal point" className={key}>.</button>
                ) : (
                  <span aria-hidden="true" />
                )}
                <button type="button" onClick={() => press("0")} className={key}>0</button>
                <button type="button" onClick={() => press("del")} aria-label="Delete digit" className="grid h-[52px] place-items-center rounded-[14px] active:bg-[var(--surface-sunken)]">
                  <Delete className="size-6" strokeWidth={1.5} />
                </button>
              </div>

              <button
                type="button"
                disabled={busy || minor <= 0 || !account}
                onClick={() => void save()}
                className="mt-4 h-14 shrink-0 rounded-full bg-[var(--accent)] text-[17px] font-medium text-[var(--on-accent)] transition-opacity disabled:opacity-40"
              >
                {busy ? "Saving…" : ACTION[kind]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
