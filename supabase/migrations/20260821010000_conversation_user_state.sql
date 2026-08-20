-- Account-scoped DM state. This table stores metadata only: never plaintext,
-- previews, drafts, filenames, keys, or decrypted content.

begin;

create table if not exists public.conversation_user_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_message_id uuid,
  last_read_created_at timestamptz,
  last_read_at timestamptz,
  archived_at timestamptz,
  pinned_at timestamptz,
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_user_state_user_pinned_idx
  on public.conversation_user_state(user_id, pinned_at desc nulls last);
create index if not exists messages_conversation_created_id_idx
  on public.messages(conversation_id, created_at, id);

alter table public.conversation_user_state enable row level security;

-- Existing conversations start read at their current latest message so this
-- additive migration does not turn years of history into surprise unread.
insert into public.conversation_user_state(
  user_id, conversation_id, last_read_message_id, last_read_created_at, last_read_at, updated_at
)
select members.user_id, members.conversation_id, latest.id, latest.created_at, now(), now()
from public.conversation_members members
left join lateral (
  select m.id, m.created_at
  from public.messages m
  where m.conversation_id = members.conversation_id
  order by m.created_at desc, m.id desc
  limit 1
) latest on true
on conflict (user_id, conversation_id) do nothing;

drop policy if exists "conversation state owner read" on public.conversation_user_state;
create policy "conversation state owner read" on public.conversation_user_state
  for select to authenticated
  using (user_id = auth.uid() and public.is_member(conversation_id));

revoke all on public.conversation_user_state from public, anon, authenticated;
grant select on public.conversation_user_state to authenticated;

create or replace function public.mark_conversation_read(
  target_conversation uuid,
  through_message uuid
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  candidate public.messages%rowtype;
  current_id uuid;
  current_created_at timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_member(target_conversation) then raise exception 'conversation unavailable'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(me::text || ':' || target_conversation::text, 0)
  );

  select * into candidate from public.messages
  where id = through_message and conversation_id = target_conversation;
  if candidate.id is null then raise exception 'message unavailable'; end if;

  select s.last_read_message_id, s.last_read_created_at into current_id, current_created_at
  from public.conversation_user_state s
  where s.user_id = me and s.conversation_id = target_conversation;

  if current_id is not null
     and (candidate.created_at, candidate.id) <= (current_created_at, current_id) then
    return;
  end if;

  insert into public.conversation_user_state(
    user_id, conversation_id, last_read_message_id, last_read_created_at, last_read_at, updated_at
  ) values (me, target_conversation, candidate.id, candidate.created_at, now(), now())
  on conflict (user_id, conversation_id) do update
    set last_read_message_id = excluded.last_read_message_id,
        last_read_created_at = excluded.last_read_created_at,
        last_read_at = excluded.last_read_at,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_conversation_pinned(
  target_conversation uuid,
  should_pin boolean
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_member(target_conversation) then raise exception 'conversation unavailable'; end if;
  insert into public.conversation_user_state(user_id, conversation_id, pinned_at, updated_at)
  values (me, target_conversation, case when should_pin then now() else null end, now())
  on conflict (user_id, conversation_id) do update
    set pinned_at = excluded.pinned_at, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_conversation_archived(
  target_conversation uuid,
  should_archive boolean
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_member(target_conversation) then raise exception 'conversation unavailable'; end if;
  insert into public.conversation_user_state(user_id, conversation_id, archived_at, updated_at)
  values (
    me,
    target_conversation,
    case when should_archive then now() else null end,
    now()
  )
  on conflict (user_id, conversation_id) do update
    set archived_at = excluded.archived_at,
        pinned_at = case when should_archive then null else conversation_user_state.pinned_at end,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.set_conversation_muted(
  target_conversation uuid,
  mute_until timestamptz
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_member(target_conversation) then raise exception 'conversation unavailable'; end if;
  if mute_until is not null and mute_until <= now() then mute_until := null; end if;
  insert into public.conversation_user_state(user_id, conversation_id, muted_until, updated_at)
  values (me, target_conversation, mute_until, now())
  on conflict (user_id, conversation_id) do update
    set muted_until = excluded.muted_until, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.list_dm_inbox_v2(page_size integer default 1000)
returns table (
  conversation_id uuid,
  peer_id uuid,
  peer_username text,
  peer_avatar_url text,
  peer_public_key text,
  message_id uuid,
  sender_id uuid,
  ciphertext text,
  iv text,
  message_created_at timestamptz,
  unread_count bigint,
  archived_at timestamptz,
  pinned_at timestamptz,
  muted_until timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select mine.conversation_id,
         peer.user_id,
         profile.username,
         profile.avatar_url,
         profile.public_key,
         latest.id,
         latest.sender_id,
         latest.ciphertext,
         latest.iv,
         latest.created_at,
         coalesce(unreads.count, 0),
         state.archived_at,
         state.pinned_at,
         case when state.muted_until > now() then state.muted_until else null end
  from public.conversation_members mine
  join public.conversation_members peer
    on peer.conversation_id = mine.conversation_id and peer.user_id <> mine.user_id
  join public.profiles profile on profile.id = peer.user_id
  left join public.conversation_user_state state
    on state.user_id = mine.user_id and state.conversation_id = mine.conversation_id
  left join lateral (
    select m.id, m.sender_id, m.ciphertext, m.iv, m.created_at
    from public.messages m
    where m.conversation_id = mine.conversation_id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as count
    from public.messages m
    where m.conversation_id = mine.conversation_id
      and m.sender_id <> mine.user_id
      and (
        state.last_read_message_id is null
        or (m.created_at, m.id) > (state.last_read_created_at, state.last_read_message_id)
      )
  ) unreads on true
  where mine.user_id = auth.uid()
    and (select count(*) from public.conversation_members members
         where members.conversation_id = mine.conversation_id) = 2
  order by state.pinned_at desc nulls last,
           latest.created_at desc nulls last,
           mine.conversation_id
  limit greatest(1, least(coalesce(page_size, 1000), 1000))
$$;

-- WhatsApp-style archive behavior: an incoming peer message returns an
-- archived chat to the inbox. The sender's own archived state is unchanged.
create or replace function public.unarchive_dm_for_recipients()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  begin
    update public.conversation_user_state
    set archived_at = null, updated_at = now()
    where conversation_id = new.conversation_id
      and user_id <> new.sender_id
      and archived_at is not null;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists unarchive_dm_on_incoming_message on public.messages;
create trigger unarchive_dm_on_incoming_message
after insert on public.messages
for each row execute function public.unarchive_dm_for_recipients();

revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon;
revoke all on function public.set_conversation_pinned(uuid, boolean) from public, anon;
revoke all on function public.set_conversation_archived(uuid, boolean) from public, anon;
revoke all on function public.set_conversation_muted(uuid, timestamptz) from public, anon;
revoke all on function public.list_dm_inbox_v2(integer) from public, anon;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;
grant execute on function public.set_conversation_pinned(uuid, boolean) to authenticated;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
grant execute on function public.set_conversation_muted(uuid, timestamptz) to authenticated;
grant execute on function public.list_dm_inbox_v2(integer) to authenticated;

commit;
