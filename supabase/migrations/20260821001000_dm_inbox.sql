-- Exact, member-scoped DM inbox metadata. Message content remains ciphertext;
-- clients decrypt previews locally with the established account key.

begin;

-- Serialize creation for a canonical pair and deterministically reuse an
-- existing conversation. This prevents future duplicate DMs without moving or
-- deleting any historical ciphertext from duplicates created by old clients.
create or replace function public.get_or_create_dm(other uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  conv uuid;
  me uuid := auth.uid();
  pair_key text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = other then raise exception 'cannot DM yourself'; end if;
  if not exists (select 1 from public.profiles where id = other) then raise exception 'peer not found'; end if;
  pair_key := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  perform pg_advisory_xact_lock(hashtextextended(pair_key, 0));

  select cm.conversation_id into conv
  from public.conversation_members cm
  join public.conversation_members cm2 on cm2.conversation_id = cm.conversation_id
  where cm.user_id = me and cm2.user_id = other
  order by (
    select max(messages.created_at) from public.messages
    where messages.conversation_id = cm.conversation_id
  ) desc nulls last, cm.conversation_id
  limit 1;
  if conv is not null then return conv; end if;

  insert into public.conversations default values returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  return conv;
end;
$$;

revoke all on function public.get_or_create_dm(uuid) from public, anon;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

create or replace function public.list_dm_inbox(page_size integer default 50)
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
  message_created_at timestamptz
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
         latest.created_at
  from public.conversation_members mine
  join public.conversation_members peer
    on peer.conversation_id = mine.conversation_id and peer.user_id <> mine.user_id
  join public.profiles profile on profile.id = peer.user_id
  left join lateral (
    select m.id, m.sender_id, m.ciphertext, m.iv, m.created_at
    from public.messages m
    where m.conversation_id = mine.conversation_id
    order by m.created_at desc, m.id desc
    limit 1
  ) latest on true
  where mine.user_id = auth.uid()
    and (select count(*) from public.conversation_members members
         where members.conversation_id = mine.conversation_id) = 2
  order by latest.created_at desc nulls last, mine.conversation_id
  limit greatest(1, least(coalesce(page_size, 50), 100))
$$;

revoke all on function public.list_dm_inbox(integer) from public, anon;
grant execute on function public.list_dm_inbox(integer) to authenticated;

commit;
