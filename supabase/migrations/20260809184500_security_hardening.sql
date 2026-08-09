-- Wave 8: make the repository reproducible and tighten authorization.
-- Safe to run after schema.sql and waves 4-7; all changes are additive/idempotent.

begin;

-- Profile/avatar objects used by the current UI.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars: owner upload" on storage.objects;
create policy "avatars: owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner delete" on storage.objects;
create policy "avatars: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- Shared helper used by read receipts and reactions. SECURITY DEFINER avoids
-- recursive RLS while still checking the caller explicitly.
create or replace function public.can_access_message(mid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.messages msg
    join public.conversation_members cm
      on cm.conversation_id = msg.conversation_id
    where msg.id = mid and cm.user_id = auth.uid()
  );
$$;

-- Reactions were used by the frontend but missing from the committed schema.
create table if not exists public.reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.reactions enable row level security;

drop policy if exists "reactions: conversation select" on public.reactions;
create policy "reactions: conversation select" on public.reactions
  for select to authenticated using (public.can_access_message(message_id));
drop policy if exists "reactions: own insert" on public.reactions;
create policy "reactions: own insert" on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_message(message_id));
drop policy if exists "reactions: own update" on public.reactions;
create policy "reactions: own update" on public.reactions
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_message(message_id))
  with check (user_id = auth.uid() and public.can_access_message(message_id));
drop policy if exists "reactions: own delete" on public.reactions;
create policy "reactions: own delete" on public.reactions
  for delete to authenticated
  using (user_id = auth.uid() and public.can_access_message(message_id));

alter table public.reactions replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'reactions'
  ) then
    alter publication supabase_realtime add table public.reactions;
  end if;
end $$;

-- De-duplicate Web Push subscriptions by browser endpoint so repeatedly
-- pressing Enable cannot create duplicate notifications.
alter table public.push_subscriptions
  add column if not exists endpoint text
  generated always as (subscription ->> 'endpoint') stored;
delete from public.push_subscriptions older
using public.push_subscriptions newer
where older.user_id = newer.user_id
  and older.endpoint = newer.endpoint
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.id::text < newer.id::text)
  );
create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions (user_id, endpoint);
drop policy if exists "push_subscriptions: update own" on public.push_subscriptions;
create policy "push_subscriptions: update own" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A read receipt must reference a message in one of the reader's conversations.
drop policy if exists "message_reads: insert own read" on public.message_reads;
create policy "message_reads: insert own read" on public.message_reads
  for insert to authenticated
  with check (
    reader_id = auth.uid()
    and public.can_access_message(message_id)
  );

-- Replace the already-deployed group policy with the hardened Wave 7 rule.
create or replace function public.is_group_creator(gid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.groups g
    where g.id = gid and g.created_by = auth.uid()
  );
$$;
drop policy if exists "gm insert" on public.group_members;
create policy "gm insert" on public.group_members
  for insert with check (
    public.is_group_member(group_id)
    or (user_id = auth.uid() and public.is_group_creator(group_id))
  );

commit;
