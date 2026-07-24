-- ============================================================================
-- Solink — Wave 6: Web Push subscriptions
-- ============================================================================
-- Run this in the Supabase SQL Editor.
--
-- Stores each device's Web Push subscription (the PushSubscription JSON
-- returned by the browser). The `send-push` Edge Function reads these rows to
-- deliver notifications. No message content is ever stored here.
-- ============================================================================

-- 1. Subscription table: one row per subscribed device.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

-- 2. Enable Row Level Security.
alter table public.push_subscriptions enable row level security;

-- 3. Policies — users manage only their own subscription rows.

drop policy if exists "push_subscriptions: insert own" on public.push_subscriptions;
create policy "push_subscriptions: insert own"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_subscriptions: select own" on public.push_subscriptions;
create policy "push_subscriptions: select own"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_subscriptions: delete own" on public.push_subscriptions;
create policy "push_subscriptions: delete own"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());
