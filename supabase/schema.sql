-- Solink — Supabase schema (run this in the Supabase SQL editor for the cloud phase).
-- Stores ONLY ciphertext. Plaintext never reaches the database.

-- 1. Profiles: one row per user, holds the username + public key.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  public_key text not null,
  created_at timestamptz not null default now()
);
-- Cross-device key backup: the device private key wrapped under a user
-- passphrase (PBKDF2 + AES-GCM). Opaque ciphertext — useless without the
-- passphrase, which never leaves the browser. Kept in its own table so RLS can
-- restrict reads to the owner (profiles are readable by others for peer lookup).
create table if not exists public.key_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  blob text not null,
  updated_at timestamptz not null default now()
);
alter table public.key_backups enable row level security;
create policy "own key backup select" on public.key_backups
  for select using (user_id = auth.uid());
create policy "own key backup upsert" on public.key_backups
  for insert with check (user_id = auth.uid());
create policy "own key backup update" on public.key_backups
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Conversations (a 1-on-1 thread).
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- 3. Membership (two rows per 1-on-1 conversation).
create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  primary key (conversation_id, user_id)
);

-- 4. Messages: ciphertext + iv only.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  ciphertext text not null,
  iv text not null,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Profiles: anyone signed in can look up usernames/public keys; you edit only your own.
create policy "profiles readable" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "profiles self-insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles self-update" on public.profiles
  for update using (auth.uid() = id);

-- Helper: is the current user a member of a conversation?
create or replace function public.is_member(conv uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = auth.uid()
  );
$$;

-- Messages: only members of the conversation can read/write.
create policy "messages readable by members" on public.messages
  for select using (public.is_member(conversation_id));
create policy "messages insert by sender-member" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_member(conversation_id)
  );
-- Unsend: a sender can delete their own messages (removes for everyone).
create policy "messages deletable by sender" on public.messages
  for delete using (sender_id = auth.uid());

-- Members: you can see rows for conversations you belong to.
create policy "members readable" on public.conversation_members
  for select using (public.is_member(conversation_id));

-- Find (or create) the single 1-on-1 conversation between the current user and `other`.
-- SECURITY DEFINER so it can create the conversation + membership rows atomically,
-- while still only ever linking the caller (auth.uid()) to the chosen peer.
create or replace function public.get_or_create_dm(other uuid)
returns uuid language plpgsql security definer as $$
declare
  conv uuid;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = other then raise exception 'cannot DM yourself'; end if;

  select cm.conversation_id into conv
  from public.conversation_members cm
  join public.conversation_members cm2
    on cm2.conversation_id = cm.conversation_id
  where cm.user_id = me and cm2.user_id = other
  limit 1;

  if conv is not null then
    return conv;
  end if;

  insert into public.conversations default values returning id into conv;
  insert into public.conversation_members (conversation_id, user_id)
    values (conv, me), (conv, other);
  return conv;
end;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- Enable Realtime on messages.
alter publication supabase_realtime add table public.messages;
-- REQUIRED for realtime postgres_changes to fire with a column filter + RLS.
-- Without this, messages save but never deliver live to the other side.
alter table public.messages replica identity full;
