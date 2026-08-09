-- Wave 7: group chats (additive — the 1-on-1 tables and flow are untouched).
--
-- A group message is encrypted once PER member using the same pairwise ECDH
-- shared key members already use 1-on-1 (lib/crypto.ts encryptForRecipients).
-- The server stores a { recipientId -> {ciphertext, iv} } map in `recipients`;
-- each member decrypts only their own entry. The server never sees plaintext.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipients jsonb not null, -- { "<userId>": { "ciphertext": "...", "iv": "..." } }
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at);

-- SECURITY DEFINER so the membership check inside group_members policies doesn't
-- recurse through RLS.
create or replace function public.is_group_member(gid uuid) returns boolean
  language sql security definer stable
  set search_path = public, pg_temp as $$
    select exists(
      select 1 from public.group_members gm
      where gm.group_id = gid and gm.user_id = auth.uid()
    );
  $$;

-- The creator must be able to seed their own membership immediately after
-- inserting the group, before is_group_member() can return true.
create or replace function public.is_group_creator(gid uuid) returns boolean
  language sql security definer stable
  set search_path = public, pg_temp as $$
    select exists(
      select 1 from public.groups g
      where g.id = gid and g.created_by = auth.uid()
    );
  $$;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

create policy "groups select" on public.groups for select using (public.is_group_member(id));
create policy "groups insert" on public.groups for insert with check (created_by = auth.uid());

create policy "gm select" on public.group_members for select using (public.is_group_member(group_id));
-- Existing members can add people. A non-member may only seed their own
-- membership when they are the recorded creator; knowing a group UUID is not
-- enough to self-join.
create policy "gm insert" on public.group_members
  for insert with check (
    public.is_group_member(group_id)
    or (user_id = auth.uid() and public.is_group_creator(group_id))
  );

create policy "gmsg select" on public.group_messages for select using (public.is_group_member(group_id));
create policy "gmsg insert" on public.group_messages
  for insert with check (sender_id = auth.uid() and public.is_group_member(group_id));

-- Realtime delivery for live group messages.
alter table public.group_messages replica identity full;
alter publication supabase_realtime add table public.group_messages;
