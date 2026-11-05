-- ============================================================================
-- Personal Finance Tracker — schema, constraints, RLS and the batch writer.
--
-- Apply with:  supabase db push        (or paste into the SQL editor)
--
-- Ownership rule: every user-owned row carries `user_id`. Row Level Security
-- scopes all reads and writes to `auth.uid()`, and composite foreign keys stop
-- a client from pointing a transaction at another user's account or category
-- even if it guesses the id.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  currency          text    not null default 'VND' check (currency in ('VND', 'USD', 'AUD')),
  month_start_day   int     not null default 1 check (month_start_day between 1 and 28),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 80),
  kind            text not null default 'cash' check (kind in ('cash', 'bank', 'savings', 'ewallet')),
  currency        text not null default 'VND' check (currency in ('VND', 'USD', 'AUD')),
  opening_balance numeric(18, 2) not null default 0,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Ownership composite key: referenced by transactions together with user_id.
  constraint accounts_id_user_unique unique (id, user_id)
);

create unique index if not exists accounts_user_name_unique on public.accounts (user_id, lower(btrim(name)));
create index if not exists accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  kind        text not null check (kind in ('income', 'expense')),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_id_user_unique unique (id, user_id)
);

create unique index if not exists categories_user_name_kind_unique
  on public.categories (user_id, lower(btrim(name)), kind);
create index if not exists categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  tx_date        date not null,
  description    text not null check (length(btrim(description)) between 1 and 200),
  type           text not null check (type in ('income', 'expense', 'transfer')),
  category_id    uuid,
  account_id     uuid not null,
  to_account_id  uuid,
  amount         numeric(18, 2) not null check (amount > 0),
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        int  not null default 1 check (version > 0),

  -- Ownership is enforced by the DATABASE, not by the interface: a row can
  -- only reference an account/category belonging to the same user.
  constraint transactions_account_fk
    foreign key (account_id, user_id) references public.accounts (id, user_id),
  constraint transactions_category_fk
    foreign key (category_id, user_id) references public.categories (id, user_id),
  constraint transactions_to_account_fk
    foreign key (to_account_id, user_id) references public.accounts (id, user_id),

  -- Shape rules that a CHECK can express.
  constraint transactions_transfer_shape check (
    (type = 'transfer'
      and to_account_id is not null
      and to_account_id <> account_id
      and category_id is null)
    or
    (type in ('income', 'expense')
      and to_account_id is null)
  )
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, tx_date desc);
create index if not exists transactions_user_account_idx on public.transactions (user_id, account_id);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category_id);

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  month       text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category_id uuid,
  amount      numeric(18, 2) not null check (amount > 0),
  created_at  timestamptz not null default now(),

  constraint budgets_category_fk
    foreign key (category_id, user_id) references public.categories (id, user_id)
);

-- One budget per user per month per category; NULL category is the overall one.
create unique index if not exists budgets_user_month_category_unique
  on public.budgets (user_id, month, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists budgets_user_month_idx on public.budgets (user_id, month);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists accounts_touch on public.accounts;
create trigger accounts_touch before update on public.accounts
  for each row execute function public.touch_updated_at();

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Category / transaction compatibility
--
-- "Food" is an expense category and must not appear on an income row.
-- A CHECK cannot read another table, so this is a trigger. It runs as the
-- table owner, and RLS still governs who may write the row in the first place.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_category_type()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  if new.category_id is null then
    if new.type <> 'transfer' then
      raise exception 'FINANCE_INVALID: row %: % transactions may omit a category', new.id, new.type;
    end if;
    return new;
  end if;

  select kind into v_kind from public.categories where id = new.category_id;
  if v_kind is null then
    raise exception 'FINANCE_INVALID: row %: category % does not exist', new.id, new.category_id;
  end if;
  if v_kind <> new.type then
    raise exception 'FINANCE_INVALID: row %: category is for %, but the row is %', new.id, v_kind, new.type;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_category_type on public.transactions;
create trigger transactions_category_type before insert or update on public.transactions
  for each row execute function public.enforce_category_type();

-- ---------------------------------------------------------------------------
-- Default workspace, created once per user and safe to re-run.
-- ---------------------------------------------------------------------------
create or replace function public.initialize_workspace()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'FINANCE_AUTH: not authenticated';
  end if;

  insert into public.profiles (id) values (auth.uid())
    on conflict (id) do nothing;

  -- Archived placeholder account, so the spreadsheet is usable immediately.
  insert into public.accounts (user_id, name, kind, currency, opening_balance)
  values (auth.uid(), 'Cash', 'cash', 'VND', 0)
    on conflict (user_id, lower(btrim(name))) do nothing;

  insert into public.categories (user_id, name, kind)
  select auth.uid(), name, 'expense'
  from unnest(array[
    'Food', 'Transport', 'Shopping', 'Education', 'Entertainment',
    'Health', 'Subscriptions', 'Pets', 'Travel', 'Other'
  ]) as name
  on conflict (user_id, lower(btrim(name)), kind) do nothing;

  insert into public.categories (user_id, name, kind)
  select auth.uid(), name, 'income'
  from unnest(array['Allowance', 'Salary', 'Freelance', 'Gifts', 'Other']) as name
  on conflict (user_id, lower(btrim(name)), kind) do nothing;
end;
$$;

-- Seed immediately when the account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.accounts (user_id, name, kind, currency, opening_balance)
  values (new.id, 'Cash', 'cash', 'VND', 0)
    on conflict (user_id, lower(btrim(name))) do nothing;
  insert into public.categories (user_id, name, kind)
  select new.id, name, 'expense'
  from unnest(array['Food', 'Transport', 'Shopping', 'Education', 'Entertainment',
                   'Health', 'Subscriptions', 'Pets', 'Travel', 'Other']) as name
    on conflict (user_id, lower(btrim(name)), kind) do nothing;
  insert into public.categories (user_id, name, kind)
  select new.id, name, 'income'
  from unnest(array['Allowance', 'Salary', 'Freelance', 'Gifts', 'Other']) as name
    on conflict (user_id, lower(btrim(name)), kind) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Transactional batch writer
--
-- The spreadsheet commits a whole paste with ONE call. Everything below runs
-- inside a single implicit transaction: if any row fails or conflicts, the
-- function raises and NOT A SINGLE ROW is written. There is no partial state.
-- ---------------------------------------------------------------------------
create or replace function public.apply_transaction_batch(
  p_creates jsonb,
  p_updates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_row      jsonb;
  v_id       uuid;
  v_date     date;
  v_type     text;
  v_desc     text;
  v_amount   numeric;
  v_account  uuid;
  v_to       uuid;
  v_category uuid;
  v_notes    text;
  v_version  int;
  v_created  int := 0;
  v_updated  int := 0;
  v_conflicts uuid[] := '{}';
  v_affected int;
begin
  if v_uid is null then
    raise exception 'FINANCE_AUTH: not authenticated';
  end if;

  ------------------------------------------------------------------ creates
  for v_row in select * from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb)) loop
    v_date    := (v_row ->> 'date')::date;
    v_desc    := btrim(v_row ->> 'description');
    v_type    := v_row ->> 'type';
    v_amount  := (v_row ->> 'amount')::numeric;
    v_account := (v_row ->> 'account_id')::uuid;
    v_to      := nullif(v_row ->> 'to_account_id', '')::uuid;
    v_category := nullif(v_row ->> 'category_id', '')::uuid;
    v_notes   := coalesce(v_row ->> 'notes', '');

    if v_date is null or v_desc = '' or v_amount is null or v_amount <= 0 then
      raise exception 'FINANCE_INVALID: a row is missing a date, description or a positive amount';
    end if;

    insert into public.transactions (
      user_id, tx_date, description, type, category_id, account_id, to_account_id, amount, notes
    ) values (
      v_uid, v_date, v_desc, v_type, v_category, v_account, v_to, v_amount, left(v_notes, 1000)
    )
    returning id into v_id;

    v_created := v_created + 1;
  end loop;

  ------------------------------------------------------------------ updates
  for v_row in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    v_id      := (v_row ->> 'id')::uuid;
    v_version := (v_row ->> 'version')::int;
    v_date    := (v_row ->> 'date')::date;
    v_desc    := btrim(v_row ->> 'description');
    v_type    := v_row ->> 'type';
    v_amount  := (v_row ->> 'amount')::numeric;
    v_account := (v_row ->> 'account_id')::uuid;
    v_to      := nullif(v_row ->> 'to_account_id', '')::uuid;
    v_category := nullif(v_row ->> 'category_id', '')::uuid;
    v_notes   := coalesce(v_row ->> 'notes', '');

    if v_date is null or v_desc = '' or v_amount is null or v_amount <= 0 then
      raise exception 'FINANCE_INVALID: a row is missing a date, description or a positive amount';
    end if;

    -- Optimistic concurrency: only update the row the user actually saw.
    update public.transactions
       set tx_date       = v_date,
           description   = v_desc,
           type          = v_type,
           category_id   = v_category,
           account_id    = v_account,
           to_account_id = v_to,
           amount        = v_amount,
           notes         = left(v_notes, 1000),
           version       = version + 1
     where id = v_id
       and user_id = v_uid
       and version = v_version;

    get diagnostics v_affected = row_count;

    if v_affected = 0 then
      -- Either the row vanished or another device changed it first.
      v_conflicts := array_append(v_conflicts, v_id);
    else
      v_updated := v_updated + 1;
    end if;
  end loop;

  if array_length(v_conflicts, 1) is not null then
    raise exception 'FINANCE_CONFLICT:%', (
      select string_agg(id::text, ',') from unnest(v_conflicts) as id
    );
  end if;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Every statement is scoped to the signed-in user. RLS applies to the
-- security-invoker RPC above as well, so the batch writer cannot be used to
-- escape these rules.
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.accounts    enable row level security;
alter table public.categories  enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets     enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists accounts_own on public.accounts;
create policy accounts_own on public.accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists categories_own on public.categories;
create policy categories_own on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transactions_own on public.transactions;
create policy transactions_own on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists budgets_own on public.budgets;
create policy budgets_own on public.budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Keep RLS on even for the table owner, so nothing bypasses it by accident.
alter table public.profiles    force row level security;
alter table public.accounts    force row level security;
alter table public.categories  force row level security;
alter table public.transactions force row level security;
alter table public.budgets     force row level security;

-- Batch RPC: callable by the signed-in user only.
revoke all on function public.apply_transaction_batch(jsonb, jsonb) from public;
grant execute on function public.apply_transaction_batch(jsonb, jsonb) to authenticated;
revoke all on function public.initialize_workspace() from public;
grant execute on function public.initialize_workspace() to authenticated;

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- Granted explicitly so the app works no matter how the dashboard's
-- "Automatically expose new tables" option is set. `anon` deliberately gets
-- NOTHING: every request must be authenticated, and RLS then scopes it to the
-- signed-in user. Grants alone never expose data, because RLS is forced.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles    to authenticated;
grant select, insert, update, delete on public.accounts    to authenticated;
grant select, insert, update, delete on public.categories  to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets     to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (optional, used to refresh the grid when another device saves)
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;