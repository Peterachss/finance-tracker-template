-- ============================================================================
-- 0002: retry-safe batch writes, plus a fixed search_path on trigger helpers.
--
-- Additive. 0001 is untouched and `apply_transaction_batch(jsonb, jsonb)` keeps
-- working, so an older deployed client is not broken by applying this.
--
-- Problem: if the response to a save is lost (flaky mobile network), the client
-- cannot know whether the batch landed, and a blind retry would insert every
-- created row a second time. The client now sends one request id per distinct
-- batch. A replay of the same id returns the stored result and writes nothing.
-- ============================================================================

create table if not exists public.batch_requests (
  user_id     uuid not null references auth.users (id) on delete cascade,
  request_id  uuid not null,
  result      jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.batch_requests enable row level security;
alter table public.batch_requests force row level security;

drop policy if exists batch_requests_own on public.batch_requests;
create policy batch_requests_own on public.batch_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert on public.batch_requests to authenticated;

-- security invoker: RLS on transactions and batch_requests applies to the caller.
-- The whole function runs in one transaction, so recording the request id and
-- applying the batch succeed or fail together.
create or replace function public.apply_transaction_batch_idempotent(
  p_request_id uuid,
  p_creates jsonb,
  p_updates jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_prior  jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'FINANCE_AUTH: not authenticated';
  end if;
  if p_request_id is null then
    raise exception 'FINANCE_INVALID: a request id is required';
  end if;

  -- Serialise concurrent retries of the same request id for this user.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || p_request_id::text, 0));

  select result into v_prior
    from public.batch_requests
   where user_id = v_uid and request_id = p_request_id;

  if v_prior is not null then
    return v_prior || jsonb_build_object('replayed', true);
  end if;

  v_result := public.apply_transaction_batch(p_creates, p_updates);

  insert into public.batch_requests (user_id, request_id, result)
  values (v_uid, p_request_id, v_result);

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.apply_transaction_batch_idempotent(uuid, jsonb, jsonb) from public;
grant execute on function public.apply_transaction_batch_idempotent(uuid, jsonb, jsonb) to authenticated;

-- Trigger helpers from 0001 had no fixed search_path (flagged by Supabase's
-- security advisor). Pin it; behaviour is unchanged.
alter function public.touch_updated_at()      set search_path = public;
alter function public.enforce_category_type() set search_path = public;
