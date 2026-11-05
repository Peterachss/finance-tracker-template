# Finance Tracker

A personal finance tracker built around a **spreadsheet**: you paste and edit rows in a
grid, and the dashboard, budgets and reports all read from those same saved records.

Works on iPhone Safari and desktop browsers, and can be installed to the Home Screen
as a Progressive Web App.

**Try it:** https://finance-tracker-template.vercel.app — no account, starts empty, and
anything you enter stays in your own browser.

**Make it yours:** follow the step-by-step guide in **[SETUP.md](SETUP.md)**. No coding
needed: about 20 minutes with free GitHub, Supabase and Vercel accounts. It also has a
ready-to-paste prompt for Codex, Claude Code and other AI coding tools. Your data lives
only in your own database.

### Try-it mode

Set `NEXT_PUBLIC_DEMO=1` (locally or on Vercel) to run with no sign-in and no database.
It starts like a new account and saves entries to the browser's localStorage. That is
how the public try-it site is deployed. Leave it unset for the real, synced app.

---

## What it does

- **Spreadsheet** — the primary interface. Editable cells, keyboard navigation, cell
  range selection, and multi-cell paste of rectangular blocks copied from Google Sheets
  or Excel. Pasting below the last row appends records; pasting over existing records
  edits them.
- **Dashboard** — total balance, income, expenses, net cash flow, budget progress,
  spending by category, a six-month trend and recent transactions.
- **Budgets** — an overall monthly limit plus per-category limits, with warnings at 80%
  and at 100%.
- **Settings** — currency, budgeting month start day, accounts, categories, CSV export.
- **Accounts** — Cash / Bank / Savings / E-wallet with opening balances and transfers.

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| Backend | Supabase Postgres + Supabase Auth (email/password) |
| Charts | Recharts |
| Tests | Vitest |
| Deploy | Vercel free tier + Supabase free tier |

Both free tiers are sufficient for personal use, so running costs can be zero.

### About the grid library

The brief asked for one actively maintained, permissively licensed grid with editable
cells, keyboard navigation, cell selection and multi-cell clipboard paste. The obvious
candidates were checked and none qualify:

- **AG Grid Community** — MIT, but range selection and clipboard paste are documented as
  **Enterprise** features.
- **Handsontable** — non-commercial licence; not free for a deployed app.
- **Glide Data Grid** — the npm package is unpublished and has no built-in range
  selection.
- **TanStack Table** — MIT and maintained, but headless: it provides no editing or
  clipboard engine.

So the selection, editing and paste layer is implemented directly (`components/Spreadsheet.tsx`,
`lib/sheet.ts`). It is a bounded sheet interaction layer, not a grid engine: sorting,
filtering, data fetching and persistence all live in their own modules. The paste
placement logic is unit tested.

---

## Setup

### 1. Requirements

- Node.js 20 or newer
- A free [Supabase](https://supabase.com) project

### 2. Install

```bash
npm install
cp .env.example .env.local
```

### 3. Apply the database schema

Open your Supabase project → **SQL Editor** and run each file in
`supabase/migrations/` **in number order** (`0001` → `0004`), pasting the whole file
each time.

`0001_init.sql` creates:

- `profiles`, `accounts`, `categories`, `transactions`, `budgets`
- composite foreign keys so a transaction can only reference accounts and categories
  owned by the same user
- Row Level Security policies on every user-owned table (`force row level security`)
- `apply_transaction_batch(...)`, the transactional batch writer
- default accounts and categories, seeded per user and safe to re-run

The later files add safe batch saving (`0002`), tighten a permission (`0003`), and add
the Bills, Dream list, Allowance and shared-statement tables (`0004`).

If you have the Supabase CLI you can instead run `supabase db push`.

### 4. Add credentials

In **Project Settings → API**, copy the project URL and the **publishable / anon** key
into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
```

> Never put the **service-role** key in a `NEXT_PUBLIC_*` variable. Those variables are
> compiled into the browser bundle. This app does not use the service-role key at all.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>, go to `/login` and create an account. Your records are
private to that account.

Without credentials (and without `NEXT_PUBLIC_DEMO=1`) the app shows a setup page
instead of pretending that sync works.

---

## Using the spreadsheet

Column order is **Date, Description, Type, Category, Account, Destination Account,
Amount, Notes**.

| Action | How |
| --- | --- |
| Select | Click a cell; drag or Shift-click for a range |
| Edit | Double-click, press Enter/F2, or just start typing |
| Move | Arrow keys, Tab / Shift+Tab |
| Clear | Delete / Backspace over the selection |
| Copy | Ctrl/Cmd + C — copies the selection as tab-separated values |
| Paste | Ctrl/Cmd + V — fills across then down from the active cell |
| Delete records | Select rows → **Delete selected rows** → confirm |
| Undo | **Undo** (up to the last 20 grid edits) |

### Paste and import

- **Rectangular block** — the cells land starting at the active cell and fill across,
  then down. Rows below the last record are appended; rows over existing records are
  edited, not duplicated. A paste overlapping more than 10 saved records asks first.
- **Header-aware import** — if the first pasted row looks like headers (`Date`,
  `Transaction Date`, `Description`, `Details`, `Type`, `Category`, `Account`,
  `Destination`, `Amount`, `Notes`, …), an import preview opens. You can remap any
  column or mark it ignored; ignored columns are listed back to you. Nothing is
  written until you confirm.

The preview validates every row, shows the count of valid and invalid rows, a sample of
the parsed records, and every issue with its row number, field and reason. The default
commit is **all-or-nothing** — you can tick "exclude the N invalid rows" to import the
rest, and you are shown exactly which rows will be left out before confirming.
Possible duplicates are reported, never merged or deleted.

### Dates and amounts

- Dates: `2026-04-13` or `2026/04/13` are always safe. `13/04/2026` is read as
  day-first and `04/13/2026` as month-first, because one part cannot be a month.
  **Ambiguous values like `03/04/2026` are rejected** with an explanation rather than
  guessed from a locale. Excel serial dates are supported behind an opt-in checkbox.
- Amounts: `85000`, `85,000`, `85 000`, `₫85.000`, `1,234.56` and `1 234,56` all parse.
  A separator followed by exactly three digits is a thousands group. Badly sized groups
  such as `1.2345` are rejected rather than guessed. An invalid amount never becomes
  zero.
- Negative amounts are stored as positive values with the sign expressed by `Type`. If
  the type is missing, `Expense` is inferred and you are told. A negative amount on an
  `Income` row is flagged rather than silently flipped.
- Transfers require both a source and a destination account, and the two must differ.
  Pasted text is treated as text — formulas are never evaluated.

### Save states

The toolbar always shows one of `Saved`, `Saving…`, `Unsaved changes`, `Save failed` or
`Conflict detected`.

Plain edits autosave after about 1.5 seconds. Bulk pastes and imports are validated and
committed in **one atomic database call**: either every row is written or none is. If
anything fails your edits stay on screen with a **Retry** button.

If another device edited the same record first, the database rejects the whole batch and
your local edit is kept and flagged as a conflict, with a reload path. Nothing is
silently overwritten.

> There is no offline sync engine. Unsaved edits are not visible on your other device,
> and the app never claims otherwise. A beforeunload warning fires while edits are
> unsaved.

---

## Financial rules

Money is stored as PostgreSQL `numeric(18,2)` and handled in the app as **integer minor
units**, so no calculation uses binary floating point.

```
account balance = opening balance + income − expenses − transfers out + transfers in
```

- **Transfers are excluded from income, expenses, category spending and net cash flow.**
  They still move each account exactly once, so total balance (net worth) is unaffected.
- Date ranges use an **inclusive start and an exclusive end**, and transaction dates are
  date-only (`date` columns, no time zone), so month boundaries are exact.
- Every dashboard and report figure is derived from saved transactions. Nothing is
  hardcoded, and a new account sees an empty state rather than invented numbers.

Changing the currency in Settings changes **formatting only**. It does not convert
anything, and the app says so before saving.

---

## Tests

```bash
npm test
```

78 tests covering:

| Area | File |
| --- | --- |
| Account balances with opening balances, income, expenses, transfers | `tests/finance.test.ts` |
| Transfer exclusion from income, expenses and budgets | `tests/finance.test.ts` |
| Month boundaries, inclusive/exclusive ranges, leap years | `tests/finance.test.ts` |
| Budget progress, category totals, 80%/100% warnings | `tests/finance.test.ts` |
| Amount and date parsing, quoted CSV fields, invalid rows | `tests/parse.test.ts` |
| TSV multi-row/multi-column parsing and paste placement | `tests/sheet.test.ts` |
| All-or-nothing batch validation | `tests/batch.test.ts` |
| Optimistic-concurrency conflict handling | `tests/batch.test.ts` |
| Duplicate detection | `tests/parse.test.ts` |
| CSV export, formula-injection escaping | `tests/parse.test.ts` |

Other commands:

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm run icons       # regenerate public/*.png
```

---

## Deployment

1. Push the repository to GitHub and import it into **Vercel** (framework preset:
   Next.js). Add the two `NEXT_PUBLIC_SUPABASE_*` variables to the project settings.
2. In Supabase → **Authentication → URL Configuration**, set the site URL and add your
   Vercel domain to the redirect allow-list, otherwise sign-in is rejected.
3. Apply `supabase/migrations/0001_init.sql` to the production project as above.

The app only talks to Supabase over HTTPS; **the service-role key is never used**.

---

## Installing on iPhone

1. Deploy to Vercel (or any HTTPS host) and open the URL in **Safari** on the iPhone.
2. Tap **Share → Add to Home Screen → Add**. The app opens full-screen from the Home
   Screen.
3. Sign in with the same account you use on the PC. Both devices read the same rows.

On a phone the spreadsheet switches to a card-per-record view with every field editable,
plus a bottom navigation bar sized for touch and honouring the home-indicator safe area.
Selecting a range with a mouse is a desktop interaction and is not required.

This is a Progressive Web App installed from the browser — it is not a native App Store
application.

---

## Security notes

- Row Level Security is enabled **and forced** on every user-owned table; every policy
  scopes reads and writes to `auth.uid()`.
- Ownership is re-checked in the database. Composite foreign keys
  (`(account_id, user_id) → accounts(id, user_id)`) mean a client cannot point a
  transaction at another user's account or category by guessing a UUID.
- The batch RPC is `security invoker`, so RLS applies to it, and it is granted only to
  `authenticated`.
- Amounts are checked `> 0` in the database; the transfer shape, the category/transaction
  type match and cross-user references are enforced by constraints and a trigger.
- CSV export prefixes text starting with `=`, `+`, `-` or `@` with an apostrophe so
  opening the file cannot execute it as a formula.
- No bank connectivity, no bank credentials, no analytics, no third-party scripts.

---

## Manual checks not covered by automated tests

These need a configured Supabase project and two devices. They have **not** been run
here — this build was made without credentials.

**RLS isolation**

1. Sign up as user A, add a transaction, note its id from the network tab.
2. Sign up as user B. Confirm B's list is empty and B cannot see A's row.
3. As B, send a manual `POST /rest/v1/transactions` with A's `account_id`. Expect a
   foreign-key or RLS error, not a successful insert.
4. As B, try `GET /rest/v1/transactions?id=eq.<A's transaction id>`. Expect `[]`.

**Cross-device sync**

1. Sign in on PC and iPhone with the same account.
2. Add a row on the iPhone; confirm it appears on the PC after a refresh (and via
   realtime if enabled).
3. Edit the same row on both devices. The second save must report **Conflict detected**
   and must not overwrite the first.

**Batch atomicity**

1. Paste a block with one invalid row. Confirm nothing is saved.
2. Tick "exclude invalid rows", confirm the listed rows are skipped and the rest commit.

**Budgets** — set an overall limit, then confirm transfers and income never move the
progress bar.

---

## Picking this up later (including with an AI coding tool)

State as of the last commit: **build, lint, typecheck and 78 unit tests pass; the
Supabase schema is applied and the app connects, signs in and saves rows.** The RLS
isolation and cross-device checks listed further down are still unverified.

If you clone this fresh, three things are not in the repository and must be redone:

```bash
npm install
cp .env.example .env.local     # then paste your own URL + publishable key
npm run dev
```

The database schema is not in the repository as live data — apply it once by pasting
`supabase/migrations/0001_init.sql` into the Supabase **SQL Editor** and clicking
**Run**. If you use the Supabase CLI instead, `supabase db push` does the same thing.

### Secrets — please read before sharing this project with any tool

| Value | Where it belongs | Safe to share? |
| --- | --- | --- |
| `sb_publishable_…` | `.env.local`, gitignored | ✅ Yes. It is **designed** to be public — it ships in every website using Supabase, and Row Level Security is what protects the data. |
| Database password | Supabase's secret store, never a file | ❌ **No.** Never commit it, never paste it into a chat. |
| `sb_secret_…` / service-role | nowhere | ❌ **No.** It bypasses Row Level Security completely. This app never needs it. |

`.env.local` is gitignored, so tools that read the working directory *will* see the
publishable key. That is fine. Anything in `.env.local` is ignored by git anyway — but
never add a secret key to it.

### Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm test` | 78 unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run icons` | Regenerate the PWA PNGs (no image dependency) |

### Things to be careful about if you change the code

1. **Never change the money representation.** Amounts are integer minor units at scale
   100 in the app and `numeric(18,2)` in Postgres. Introducing a float will quietly
   corrupt balances.
2. **Never let a transfer count as income or expense.** `lib/finance.ts` is the only
   place that decides this; add tests alongside any change there.
3. **Bulk writes go through `apply_transaction_batch`.** Do not replace it with a loop
   of individual requests — that would reintroduce partial-save bugs.
4. **Client-supplied `user_id` is a smell.** Owner ids come from `auth.uid()`; the
   composite foreign keys exist to stop a client pointing at another user's rows.
5. **Ambiguous input must be flagged, never guessed.** See `lib/parse.ts` — dates like
   `03/04/2026` and amounts like `1.2345` are rejected on purpose.

---

## Known limitations

- No offline sync. If the network drops, edits stay on screen and can be retried, but
  they are not queued for later and are not visible on the other device.
- The grid renders the first 300 filtered rows at a time, with a **Show all** button.
- Currency conversion is not implemented, by design; changing the currency changes
  formatting only.
- The default account "Cash" is created on signup. Add more accounts in Settings before
  entering transfer rows.