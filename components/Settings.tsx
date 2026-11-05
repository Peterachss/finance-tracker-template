"use client";

import { useState } from "react";
import { Banner, Button, Panel, ConfirmDialog, Field, Input, Select  } from "@/components/ui";
import { CURRENCIES, CURRENCY_CODES, formatMinor } from "@/lib/money";
import { parseAmountInput } from "@/lib/parse";
import { ACCOUNT_KINDS, type Account, type Category, type CurrencyCode } from "@/lib/types";

export function Preferences({ currency, monthStartDay, onSave }: {
  currency: CurrencyCode;
  monthStartDay: number;
  onSave: (patch: { currency?: CurrencyCode; month_start_day?: number }) => Promise<void>;
}) {
  const [nextCurrency, setNextCurrency] = useState<CurrencyCode>(currency);
  const [day, setDay] = useState(String(monthStartDay));
  const [message, setMessage] = useState<string | null>(null);
  const [confirmCurrency, setConfirmCurrency] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currencyChanged = nextCurrency !== currency;

  const save = async (skipConfirm = false) => {
    setError(null);
    setMessage(null);
    if (currencyChanged && !skipConfirm) {
      setConfirmCurrency(true);
      return;
    }
    try {
      await onSave({ currency: nextCurrency, month_start_day: Math.min(28, Math.max(1, Number(day) || 1)) });
      setMessage("Saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Panel title="Preferences">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Currency" hint="Formatting only. Nothing is converted.">
          <Select value={nextCurrency} onChange={(event) => setNextCurrency(event.target.value as CurrencyCode)}>
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>{code} — {CURRENCIES[code].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Budgeting month starts on day" hint="1 to 28.">
          <Input type="number" min={1} max={28} value={day} onChange={(event) => setDay(event.target.value)} />
        </Field>
      </div>

      {currencyChanged ? (
        <Banner tone="warning" title="This does not convert amounts.">
          Switching to {nextCurrency} changes how existing numbers are <strong>displayed and interpreted</strong> — a
          saved 85,000 is still the number 85,000. If your records are actually in another currency, convert them
          yourself first.
        </Banner>
      ) : null}

      <Button className="mt-3" variant="primary" onClick={() => void save()}>
        Save preferences
      </Button>
      {message ? <p className="mt-2 text-xs text-[var(--accent)]">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-[var(--negative)]">{error}</p> : null}

      <ConfirmDialog
        open={confirmCurrency}
        title="Change the display currency?"
        confirmLabel="Change currency"
        message={
          <>
            Existing amounts are <strong>not converted</strong>. They keep the same value and will simply be formatted as{" "}
            {nextCurrency}. This can be changed back at any time.
          </>
        }
        onCancel={() => setConfirmCurrency(false)}
        onConfirm={() => {
          setConfirmCurrency(false);
          void save(true);
        }}
      />
    </Panel>
  );
}

export function AccountsManager({ accounts, currency, onChanged, save }: {
  accounts: Account[];
  currency: CurrencyCode;
  onChanged: () => Promise<unknown>;
  save: (account: Partial<Account> & { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Account["kind"]>("cash");
  const [opening, setOpening] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (name.trim() === "") {
      setError("Account name is required.");
      return;
    }
    let openingBalance = 0;
    if (opening.trim() !== "") {
      const parsed = parseAmountInput(opening);
      if (!parsed.ok) {
        setError(parsed.reason);
        return;
      }
      openingBalance = parsed.value.minor;
    }
    try {
      await save({ id: editingId ?? undefined, name: name.trim(), kind, opening_balance: openingBalance });
      setName("");
      setOpening("");
      setEditingId(null);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const toggleArchive = async (account: Account) => {
    try {
      await save({ id: account.id, name: account.name, kind: account.kind, archived: !account.archived });
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Panel title="Accounts">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Bank" />
        </Field>
        <Field label="Type">
          <Select value={kind} onChange={(event) => setKind(event.target.value as Account["kind"])}>
            {ACCOUNT_KINDS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field label={`Opening balance (${currency})`}>
          <Input value={opening} onChange={(event) => setOpening(event.target.value)} placeholder="0" />
        </Field>
        <div className="flex items-end gap-2">
          <Button variant="primary" onClick={() => void submit()}>{editingId ? "Update" : "Add"}</Button>
          {editingId ? (
            <Button onClick={() => { setEditingId(null); setName(""); setOpening(""); }}>Cancel</Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--negative)]">{error}</p> : null}

      <ul className="mt-4 flex flex-col gap-2">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2 text-sm">
            <span>
              {account.name}
              <span className="ml-2 text-xs text-[var(--text-muted)]">{account.kind}</span>
              {account.archived ? <span className="ml-2 text-xs text-[var(--text-muted)]">archived</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="tnum text-xs text-[var(--text-muted)]">opens {formatMinor(account.opening_balance, currency)}</span>
              <Button
                size="sm"
                onClick={() => {
                  setEditingId(account.id);
                  setName(account.name);
                  setKind(account.kind);
                  setOpening(String(account.opening_balance / 100));
                }}
              >
                Edit
              </Button>
              <Button size="sm" onClick={() => void toggleArchive(account)}>
                {account.archived ? "Unarchive" : "Archive"}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Accounts are archived, never deleted, so historical transactions keep working. Archived accounts are hidden
        from new rows but can still be edited.
      </p>
    </Panel>
  );
}

export function CategoriesManager({ categories, onChanged, save }: {
  categories: Category[];
  onChanged: () => Promise<unknown>;
  save: (category: Partial<Category> & { name: string; kind: Category["kind"] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Category["kind"]>("expense");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (name.trim() === "") {
      setError("Category name is required.");
      return;
    }
    try {
      await save({ name: name.trim(), kind });
      setName("");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Panel title="Categories">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Coffee" />
        </Field>
        <Field label="Applies to">
          <Select value={kind} onChange={(event) => setKind(event.target.value as Category["kind"])}>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button variant="primary" onClick={() => void submit()}>Add</Button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--negative)]">{error}</p> : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(["expense", "income"] as const).map((group) => (
          <div key={group}>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">{group}</p>
            <ul className="flex flex-col gap-1">
              {categories.filter((category) => category.kind === group).map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={category.archived ? "text-[var(--text-muted)] line-through" : ""}>{category.name}</span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await save({ id: category.id, name: category.name, kind: category.kind, archived: !category.archived });
                        await onChanged();
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : String(cause));
                      }
                    }}
                  >
                    {category.archived ? "Unarchive" : "Archive"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        A category must match the transaction type. Archiving hides a category from new rows without breaking history.
      </p>
    </Panel>
  );
}




