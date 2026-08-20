-- Typed account settings and privacy-filtered global presence. Presence is
-- optional metadata and is never coupled to message delivery.

begin;

create table if not exists public.account_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  stealth_default boolean not null default false,
  auto_stealth boolean not null default false,
  message_notifications boolean not null default true,
  read_receipts boolean not null default true,
  presence_visibility text not null default 'contacts'
    check (presence_visibility in ('nobody', 'contacts', 'everyone')),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_heartbeat_at timestamptz not null default now()
);

alter table public.account_settings enable row level security;
alter table public.account_presence enable row level security;
revoke all on public.account_settings from public, anon, authenticated;
revoke all on public.account_presence from public, anon, authenticated;

create policy "account settings owner read" on public.account_settings
  for select to authenticated using (user_id = auth.uid());
grant select on public.account_settings to authenticated;

create or replace function public.get_my_account_settings()
returns public.account_settings language plpgsql security definer
set search_path = public, pg_temp as $$
declare result public.account_settings;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.account_settings(user_id) values (auth.uid()) on conflict do nothing;
  select * into result from public.account_settings where user_id = auth.uid();
  return result;
end;
$$;

create or replace function public.update_my_account_settings(
  new_theme text,
  new_stealth_default boolean,
  new_auto_stealth boolean,
  new_message_notifications boolean,
  new_read_receipts boolean,
  new_presence_visibility text
)
returns public.account_settings language plpgsql security definer
set search_path = public, pg_temp as $$
declare result public.account_settings;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if new_theme not in ('dark', 'light', 'system')
     or new_presence_visibility not in ('nobody', 'contacts', 'everyone') then
    raise exception 'invalid settings';
  end if;
  insert into public.account_settings(
    user_id, theme, stealth_default, auto_stealth, message_notifications,
    read_receipts, presence_visibility, updated_at
  ) values (
    auth.uid(), new_theme, new_stealth_default, new_auto_stealth,
    new_message_notifications, new_read_receipts, new_presence_visibility, now()
  )
  on conflict (user_id) do update set
    theme = excluded.theme,
    stealth_default = excluded.stealth_default,
    auto_stealth = excluded.auto_stealth,
    message_notifications = excluded.message_notifications,
    read_receipts = excluded.read_receipts,
    presence_visibility = excluded.presence_visibility,
    updated_at = excluded.updated_at
  returning * into result;
  return result;
end;
$$;

create or replace function public.touch_my_presence(installation_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (
    select 1 from public.account_devices devices
    where devices.id = installation_id
      and devices.user_id = auth.uid()
      and devices.revoked_at is null
  ) then raise exception 'device unavailable'; end if;
  insert into public.account_presence(user_id, last_heartbeat_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_heartbeat_at = greatest(account_presence.last_heartbeat_at, excluded.last_heartbeat_at);
end;
$$;

create or replace function public.get_account_presence(target_user uuid)
returns table (status text, last_seen timestamptz)
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  visibility text;
  heartbeat timestamptz;
  allowed boolean := false;
begin
  if auth.uid() is null then return query select 'unknown'::text, null::timestamptz; return; end if;
  select settings.presence_visibility into visibility
    from public.account_settings settings where settings.user_id = target_user;
  visibility := coalesce(visibility, 'contacts');
  if target_user = auth.uid() then
    allowed := true;
  elsif visibility = 'everyone' then
    allowed := true;
  elsif visibility = 'contacts' then
    allowed := exists (
      select 1 from public.conversation_members mine
      join public.conversation_members peer using (conversation_id)
      where mine.user_id = auth.uid() and peer.user_id = target_user
    );
  end if;
  if allowed and exists (
    select 1 from public.account_blocks
    where (blocker_id = auth.uid() and blocked_id = target_user)
       or (blocker_id = target_user and blocked_id = auth.uid())
  ) then allowed := false; end if;
  if not allowed then return query select 'unknown'::text, null::timestamptz; return; end if;

  select presence.last_heartbeat_at into heartbeat
    from public.account_presence presence where presence.user_id = target_user;
  if heartbeat is null then
    return query select 'unknown'::text, null::timestamptz;
  elsif heartbeat >= now() - interval '90 seconds' then
    return query select 'online'::text, date_trunc('minute', heartbeat);
  else
    return query select 'offline'::text, date_trunc('minute', heartbeat);
  end if;
end;
$$;

revoke all on function public.get_my_account_settings() from public, anon;
revoke all on function public.update_my_account_settings(text, boolean, boolean, boolean, boolean, text) from public, anon;
revoke all on function public.touch_my_presence(uuid) from public, anon;
revoke all on function public.get_account_presence(uuid) from public, anon;
grant execute on function public.get_my_account_settings() to authenticated;
grant execute on function public.update_my_account_settings(text, boolean, boolean, boolean, boolean, text) to authenticated;
grant execute on function public.touch_my_presence(uuid) to authenticated;
grant execute on function public.get_account_presence(uuid) to authenticated;

commit;
