-- Register at most five active installations per account. This inventory is
-- owner-only. It does not by itself revoke Supabase Auth refresh tokens; hard
-- device-bound authorization is a later protocol phase.

begin;

create table if not exists public.account_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null,
  name text not null check (char_length(name) between 1 and 48),
  platform text not null check (char_length(platform) between 1 and 80),
  public_key text not null,
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists account_devices_user_active_idx
  on public.account_devices (user_id, last_active_at desc)
  where revoked_at is null;
create unique index if not exists account_devices_active_session_idx
  on public.account_devices (user_id, auth_session_id)
  where revoked_at is null;

alter table public.account_devices enable row level security;

drop policy if exists "account_devices: owner select" on public.account_devices;
create policy "account_devices: owner select" on public.account_devices
  for select to authenticated using (user_id = auth.uid());

-- All writes go through narrow functions so callers cannot change ownership,
-- keys, revocation, or timestamps directly.
revoke all on public.account_devices from public, anon, authenticated;
grant select on public.account_devices to authenticated;

create or replace function public.register_account_device(
  installation_id uuid,
  device_name text,
  device_platform text,
  device_public_key text
)
returns public.account_devices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  current_session uuid;
  existing public.account_devices;
  result public.account_devices;
begin
  if me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  begin
    current_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    raise exception 'INVALID_AUTH_SESSION';
  end;
  if current_session is null then raise exception 'INVALID_AUTH_SESSION'; end if;
  if installation_id is null then raise exception 'installation id is required'; end if;
  if device_name is null or char_length(trim(device_name)) not between 1 and 48 then
    raise exception 'invalid device name';
  end if;
  if device_platform is null or char_length(trim(device_platform)) not between 1 and 80 then
    raise exception 'invalid device platform';
  end if;
  if device_public_key is null or char_length(device_public_key) not between 32 and 4096 then
    raise exception 'invalid device public key';
  end if;

  -- Serialize registrations per account. The transaction-scoped lock closes
  -- the race where two clients both count four active devices.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));

  if exists (
    select 1 from public.account_devices
    where user_id = me and auth_session_id = current_session and revoked_at is not null
  ) then
    raise exception 'DEVICE_SESSION_REVOKED';
  end if;

  select * into existing from public.account_devices where id = installation_id;
  if existing.id is not null and existing.user_id <> me then
    raise exception 'installation belongs to another account';
  end if;

  if existing.id is not null and existing.revoked_at is null then
    if existing.public_key <> device_public_key then
      raise exception 'device key replacement is not allowed';
    end if;
    update public.account_devices
    set name = trim(device_name),
        platform = trim(device_platform),
        auth_session_id = current_session,
        last_active_at = now()
    where id = installation_id and user_id = me
    returning * into result;
    return result;
  end if;

  if (select count(*) from public.account_devices where user_id = me and revoked_at is null) >= 5 then
    raise exception using errcode = 'P0001', message = 'DEVICE_LIMIT_REACHED';
  end if;

  if existing.id is not null then
    raise exception 'revoked installation ids cannot be reused';
  end if;

  insert into public.account_devices (
    id, user_id, auth_session_id, name, platform, public_key, key_version, revoked_at
  ) values (
    installation_id, me, current_session, trim(device_name), trim(device_platform), device_public_key, 1, null
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.touch_account_device(installation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.account_devices
  set last_active_at = now()
  where id = installation_id
    and user_id = auth.uid()
    and auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and revoked_at is null
    and last_active_at < now() - interval '15 minutes';
end;
$$;

create or replace function public.rename_account_device(installation_id uuid, device_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if char_length(trim(device_name)) not between 1 and 48 then
    raise exception 'invalid device name';
  end if;
  update public.account_devices
  set name = trim(device_name)
  where id = installation_id and user_id = auth.uid() and revoked_at is null;
end;
$$;

create or replace function public.revoke_account_device(installation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.account_devices
  set revoked_at = now()
  where id = installation_id and user_id = auth.uid() and revoked_at is null;
end;
$$;

revoke all on function public.register_account_device(uuid, text, text, text) from public, anon;
revoke all on function public.touch_account_device(uuid) from public, anon;
revoke all on function public.rename_account_device(uuid, text) from public, anon;
revoke all on function public.revoke_account_device(uuid) from public, anon;
grant execute on function public.register_account_device(uuid, text, text, text) to authenticated;
grant execute on function public.touch_account_device(uuid) to authenticated;
grant execute on function public.rename_account_device(uuid, text) to authenticated;
grant execute on function public.revoke_account_device(uuid) to authenticated;

commit;
