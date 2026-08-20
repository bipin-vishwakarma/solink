-- Account-scoped, server-enforced direct-message blocking. Stores identity
-- metadata only and never message content.

begin;

create table if not exists public.account_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.account_blocks enable row level security;
revoke all on public.account_blocks from public, anon, authenticated;

drop policy if exists "blocks owner read" on public.account_blocks;
create policy "blocks owner read" on public.account_blocks
  for select to authenticated using (blocker_id = auth.uid());
grant select on public.account_blocks to authenticated;

create or replace function public.block_user(target_user uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  pair_key text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if target_user = me then raise exception 'invalid target'; end if;
  if not exists (select 1 from public.profiles where id = target_user) then
    raise exception 'user unavailable';
  end if;
  pair_key := least(me::text, target_user::text) || ':' || greatest(me::text, target_user::text);
  perform pg_advisory_xact_lock(hashtextextended(pair_key, 0));
  insert into public.account_blocks(blocker_id, blocked_id)
  values (me, target_user) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(target_user uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.account_blocks where blocker_id = me and blocked_id = target_user;
end;
$$;

create or replace function public.list_my_blocks()
returns table (blocked_id uuid, blocked_username text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select blocks.blocked_id, profiles.username
  from public.account_blocks blocks
  join public.profiles profiles on profiles.id = blocks.blocked_id
  where blocks.blocker_id = auth.uid()
  order by blocks.created_at desc
$$;

create or replace function public.dm_has_block(conv uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select case
    -- This helper is callable only so the messages RLS policy can use it. Do
    -- not reveal block relationships for conversations the caller cannot see.
    when exists (
      select 1 from public.conversation_members caller
      where caller.conversation_id = conv and caller.user_id = auth.uid()
    ) then exists (
      select 1
      from public.account_blocks blocks
      join public.conversation_members first_member
        on first_member.conversation_id = conv and first_member.user_id = blocks.blocker_id
      join public.conversation_members second_member
        on second_member.conversation_id = conv and second_member.user_id = blocks.blocked_id
    )
    else false
  end
$$;

create or replace function public.can_interact_with_message(mid uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.messages msg
    join public.conversation_members caller
      on caller.conversation_id = msg.conversation_id
     and caller.user_id = auth.uid()
    where msg.id = mid
      and not exists (
        select 1
        from public.account_blocks blocks
        join public.conversation_members first_member
          on first_member.conversation_id = msg.conversation_id
         and first_member.user_id = blocks.blocker_id
        join public.conversation_members second_member
          on second_member.conversation_id = msg.conversation_id
         and second_member.user_id = blocks.blocked_id
      )
  )
$$;

create or replace function public.can_upload_attachment(object_name text)
returns boolean language plpgsql stable security definer
set search_path = public, storage, pg_temp as $$
declare conv uuid;
begin
  begin
    conv := (storage.foldername(object_name))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.is_member(conv) and not public.dm_has_block(conv);
end;
$$;

drop policy if exists "messages blocked pairs denied" on public.messages;
create policy "messages blocked pairs denied" on public.messages
  as restrictive for insert to authenticated
  with check (not public.dm_has_block(conversation_id));

drop policy if exists "attachments: members can upload" on storage.objects;
create policy "attachments: members can upload"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.can_upload_attachment(name)
  );

-- Blocking stops secondary interaction too. Existing ciphertext and receipts
-- stay readable so neither user loses conversation history.
drop policy if exists "message_reads: insert own read" on public.message_reads;
create policy "message_reads: insert own read" on public.message_reads
  for insert to authenticated
  with check (
    reader_id = auth.uid()
    and public.can_interact_with_message(message_id)
  );

drop policy if exists "reactions: own insert" on public.reactions;
create policy "reactions: own insert" on public.reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_interact_with_message(message_id)
  );
drop policy if exists "reactions: own update" on public.reactions;
create policy "reactions: own update" on public.reactions
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.can_interact_with_message(message_id)
  )
  with check (
    user_id = auth.uid()
    and public.can_interact_with_message(message_id)
  );

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
  pair_key := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  perform pg_advisory_xact_lock(hashtextextended(pair_key, 0));

  if not exists (select 1 from public.profiles where id = other) or exists (
    select 1 from public.account_blocks
    where (blocker_id = me and blocked_id = other)
       or (blocker_id = other and blocked_id = me)
  ) then
    raise exception 'conversation unavailable';
  end if;

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
  insert into public.conversation_members(conversation_id, user_id) values (conv, me), (conv, other);
  return conv;
end;
$$;

-- Skip content-free push when either participant has blocked the other.
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer
set search_path = public, extensions, vault, pg_temp as $$
declare recipient uuid; function_url text; webhook_secret text;
begin
  begin
    if exists (
      select 1
      from public.account_blocks blocks
      join public.conversation_members first_member
        on first_member.conversation_id = new.conversation_id
       and first_member.user_id = blocks.blocker_id
      join public.conversation_members second_member
        on second_member.conversation_id = new.conversation_id
       and second_member.user_id = blocks.blocked_id
    ) then return new; end if;
    select decrypted_secret into function_url from vault.decrypted_secrets
      where name = 'solink_send_push_url' order by created_at desc limit 1;
    select decrypted_secret into webhook_secret from vault.decrypted_secrets
      where name = 'solink_push_webhook_secret' order by created_at desc limit 1;
    if function_url is null or webhook_secret is null then return new; end if;
    select user_id into recipient from public.conversation_members
      where conversation_id = new.conversation_id and user_id <> new.sender_id limit 1;
    if recipient is not null then
      perform net.http_post(
        url := function_url,
        headers := jsonb_build_object('Content-Type','application/json','X-Solink-Push-Secret',webhook_secret),
        body := jsonb_build_object('recipientId',recipient::text,'disguised',true)
      );
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.list_my_blocks() from public, anon;
revoke all on function public.dm_has_block(uuid) from public, anon;
revoke all on function public.can_interact_with_message(uuid) from public, anon;
revoke all on function public.can_upload_attachment(text) from public, anon;
revoke all on function public.get_or_create_dm(uuid) from public, anon;
revoke all on function public.notify_new_message() from public, anon, authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_my_blocks() to authenticated;
grant execute on function public.dm_has_block(uuid) to authenticated;
grant execute on function public.can_interact_with_message(uuid) to authenticated;
grant execute on function public.can_upload_attachment(text) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;

commit;
