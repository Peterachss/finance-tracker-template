-- 0004: bills, dream list (goals), money owed to you with a read-only share link,
-- and the monthly allowance split. Also fixes inserts from the app: the
-- client never sends user_id, so it must default to the signed-in user.

alter table public.accounts   alter column user_id set default auth.uid();
alter table public.categories alter column user_id set default auth.uid();
alter table public.budgets    alter column user_id set default auth.uid();

-- bills and subscriptions ------------------------------------------------------
create table if not exists public.bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  amount      numeric(18, 2) not null check (amount > 0),
  cycle       text not null default 'monthly' check (cycle in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_due    date not null,
  category_id uuid,
  account_id  uuid,
  notes       text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint bills_category_fk foreign key (category_id, user_id) references public.categories (id, user_id),
  constraint bills_account_fk  foreign key (account_id, user_id) references public.accounts (id, user_id)
);
create index if not exists bills_user_idx on public.bills (user_id, next_due);

-- dream list ----------------------------------------------------------------
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  target      numeric(18, 2) not null check (target > 0),
  link        text not null default '',
  achieved    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.goal_contributions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id     uuid not null,
  amount      numeric(18, 2) not null check (amount <> 0),
  tx_date     date not null default current_date,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  constraint goal_contributions_goal_fk foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index if not exists goal_contributions_goal_idx on public.goal_contributions (goal_id);

-- money owed to the user (e.g. a family member) ------------------------------------------
create table if not exists public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person      text not null default 'Family' check (length(trim(person)) between 1 and 60),
  tx_date     date not null default current_date,
  description text not null default '' check (length(description) <= 200),
  amount      numeric(18, 2) not null check (amount > 0),
  kind        text not null default 'owed' check (kind in ('owed', 'repaid')),
  -- Ticked when this person has paid this item back (the sheet's checkbox column).
  settled     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists debts_user_person_idx on public.debts (user_id, person, tx_date);

create table if not exists public.debt_shares (
  token       text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person      text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, person)
);

-- monthly allowance split ------------------------------------------------------
create table if not exists public.buckets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  amount      numeric(18, 2) not null check (amount > 0),
  category_id uuid,
  is_saving   boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint buckets_category_fk foreign key (category_id, user_id) references public.categories (id, user_id)
);

-- security --------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bills', 'goals', 'goal_contributions', 'debts', 'debt_shares', 'buckets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_own', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Read-only view for whoever holds the share link. Returns only that person's
-- rows, only the fields shown on the page, and nothing when the token is wrong.
create or replace function public.shared_debts(p_token text)
returns table (person text, tx_date date, description text, amount numeric, kind text, settled boolean, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.person, d.tx_date, d.description, d.amount, d.kind, d.settled, p.currency
  from public.debt_shares s
  join public.debts d on d.user_id = s.user_id and d.person = s.person
  join public.profiles p on p.id = s.user_id
  where s.token = p_token and length(p_token) >= 24
  order by d.tx_date, d.created_at;
$$;
revoke execute on function public.shared_debts(text) from public;
grant execute on function public.shared_debts(text) to anon, authenticated;
