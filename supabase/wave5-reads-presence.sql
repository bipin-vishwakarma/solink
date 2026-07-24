-- ============================================================================
-- Solink — Wave 5: Read receipts (+ presence note)
-- ============================================================================
-- Run this in the Supabase SQL Editor.
--
-- Presence note:
--   Online / last-seen presence needs NO schema and NO table. It is handled
--   entirely by Supabase Realtime Presence on the existing per-conversation
--   channel — clients track/untrack their own state and receive sync/join/
--   leave events. Nothing to run here for presence.
-- ============================================================================

-- 1. Read-receipt table: one row per (message, reader).
create table if not exists public.message_reads (
  message_id uuid references public.messages(id) on delete cascade,
  reader_id  uuid references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, reader_id)
);

-- 2. Enable Row Level Security.
alter table public.message_reads enable row level security;

-- 3. Policies.

-- A user may mark a message as read only for THEMSELVES.
create policy "message_reads: insert own read"
  on public.message_reads
  for insert
  to authenticated
  with check (reader_id = auth.uid());

-- A user may SELECT read rows for messages in conversations they belong to.
create policy "message_reads: select in own conversations"
  on public.message_reads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reads.message_id
        and public.is_member(m.conversation_id)
    )
  );

-- 4. Broadcast read receipts over Realtime so senders see them live.
alter publication supabase_realtime add table public.message_reads;
