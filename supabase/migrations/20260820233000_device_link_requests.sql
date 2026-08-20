-- One-time, end-to-end encrypted transfer of the established account key to an
-- explicitly approved installation. The table is private; clients use only the
-- role-bound functions below.

begin;

create table public.device_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requester_session_id uuid not null,
  requester_installation_id uuid not null,
  name text not null check (char_length(name) between 1 and 48),
  platform text not null check (char_length(platform) between 1 and 80),
  candidate_public_key text not null check (char_length(candidate_public_key) between 32 and 4096),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled', 'consumed')),
  transfer_envelope jsonb,
  confirmation_token_hash text,
  approved_by_device_id uuid references public.account_devices(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  approved_at timestamptz,
  consumed_at timestamptz
);

create index device_link_requests_user_pending_idx
  on public.device_link_requests (user_id, created_at desc)
  where status in ('pending', 'approved');
create unique index device_link_requests_live_session_idx
  on public.device_link_requests (user_id, requester_session_id)
  where status in ('pending', 'approved');

alter table public.device_link_requests enable row level security;
revoke all on public.device_link_requests from public, anon, authenticated;

create or replace function public.current_active_device()
returns public.account_devices
language sql stable security definer
set search_path = public, pg_temp
as $$
  select d from public.account_devices d
  where d.user_id = auth.uid()
    and d.auth_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and d.revoked_at is null
  limit 1
$$;

create or replace function public.request_device_link(
  installation_id uuid,
  device_name text,
  device_platform text,
  candidate_public_key text
)
returns public.device_link_requests
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  current_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  result public.device_link_requests;
begin
  if me is null or current_session is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if installation_id is null then raise exception 'installation id is required'; end if;
  if char_length(trim(device_name)) not between 1 and 48 then raise exception 'invalid device name'; end if;
  if char_length(trim(device_platform)) not between 1 and 80 then raise exception 'invalid device platform'; end if;
  if char_length(candidate_public_key) not between 32 and 4096 then raise exception 'invalid candidate key'; end if;

  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  update public.device_link_requests set status = 'cancelled'
  where user_id = me and status in ('pending', 'approved') and expires_at <= now();
  if (select count(*) from public.account_devices where user_id = me and revoked_at is null) >= 5 then
    raise exception using errcode = 'P0001', message = 'DEVICE_LIMIT_REACHED';
  end if;
  if (select count(*) from public.device_link_requests where user_id = me and status = 'pending') >= 3 then
    raise exception 'TOO_MANY_LINK_REQUESTS';
  end if;

  insert into public.device_link_requests (
    user_id, requester_session_id, requester_installation_id, name, platform, candidate_public_key
  ) values (
    me, current_session, installation_id, trim(device_name), trim(device_platform), candidate_public_key
  ) returning * into result;
  return result;
end;
$$;

create or replace function public.get_device_link(link_request_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare result public.device_link_requests;
begin
  select * into result from public.device_link_requests
  where id = link_request_id
    and user_id = auth.uid()
    and requester_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if result.id is null then raise exception 'LINK_REQUEST_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id', result.id, 'name', result.name, 'platform', result.platform,
    'candidate_public_key', result.candidate_public_key,
    'status', case when result.expires_at <= now() and result.status in ('pending','approved') then 'cancelled' else result.status end,
    'created_at', result.created_at, 'expires_at', result.expires_at,
    'transfer_envelope', result.transfer_envelope
  );
end;
$$;

create or replace function public.list_pending_device_links()
returns setof jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if (public.current_active_device()).id is null then raise exception 'ACTIVE_DEVICE_REQUIRED'; end if;
  return query select jsonb_build_object(
      'id', r.id, 'name', r.name, 'platform', r.platform,
      'candidate_public_key', r.candidate_public_key, 'status', r.status,
      'created_at', r.created_at, 'expires_at', r.expires_at
    ) from public.device_link_requests r
    where r.user_id = auth.uid() and r.status = 'pending' and r.expires_at > now()
    order by r.created_at desc;
end;
$$;

create or replace function public.approve_device_link(
  link_request_id uuid,
  transfer_payload jsonb,
  confirmation_token_hash text
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare approver public.account_devices; req public.device_link_requests;
begin
  approver := public.current_active_device();
  if approver.id is null then raise exception 'ACTIVE_DEVICE_REQUIRED'; end if;
  select * into req from public.device_link_requests where id = link_request_id for update;
  if req.user_id <> auth.uid() or req.status <> 'pending' or req.expires_at <= now() then
    raise exception 'LINK_REQUEST_UNAVAILABLE';
  end if;
  if req.requester_session_id = approver.auth_session_id then raise exception 'SELF_APPROVAL_NOT_ALLOWED'; end if;
  if transfer_payload is null or confirmation_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TRANSFER';
  end if;
  update public.device_link_requests set status = 'approved', transfer_envelope = transfer_payload,
    confirmation_token_hash = approve_device_link.confirmation_token_hash,
    approved_by_device_id = approver.id, approved_at = now()
  where id = link_request_id;
end;
$$;

create or replace function public.deny_device_link(link_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (public.current_active_device()).id is null then raise exception 'ACTIVE_DEVICE_REQUIRED'; end if;
  update public.device_link_requests set status = 'denied'
  where id = link_request_id and user_id = auth.uid() and status = 'pending' and expires_at > now();
  if not found then raise exception 'LINK_REQUEST_UNAVAILABLE'; end if;
end;
$$;

create or replace function public.cancel_device_link(link_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.device_link_requests set status = 'cancelled', transfer_envelope = null,
    confirmation_token_hash = null
  where id = link_request_id and user_id = auth.uid()
    and requester_session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and status in ('pending', 'approved');
end;
$$;

create or replace function public.confirm_device_link(
  link_request_id uuid,
  confirmation_token_hash text
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare req public.device_link_requests;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if confirmation_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'LINK_CONFIRMATION_FAILED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into req from public.device_link_requests where id = link_request_id for update;
  if req.user_id <> auth.uid()
    or req.requester_session_id <> nullif(auth.jwt() ->> 'session_id', '')::uuid
    or req.status <> 'approved' or req.expires_at <= now()
    or req.confirmation_token_hash <> confirm_device_link.confirmation_token_hash then
    raise exception 'LINK_CONFIRMATION_FAILED';
  end if;
  if not exists (select 1 from public.account_devices where id = req.approved_by_device_id and revoked_at is null) then
    raise exception 'APPROVER_NO_LONGER_ACTIVE';
  end if;
  if (select count(*) from public.account_devices where user_id = auth.uid() and revoked_at is null) >= 5 then
    raise exception using errcode = 'P0001', message = 'DEVICE_LIMIT_REACHED';
  end if;
  if exists (select 1 from public.account_devices where id = req.requester_installation_id) then
    raise exception 'INSTALLATION_ID_UNAVAILABLE';
  end if;
  insert into public.account_devices (
    id, user_id, auth_session_id, name, platform, public_key, key_version
  ) values (
    req.requester_installation_id, req.user_id, req.requester_session_id,
    req.name, req.platform, (select public_key from public.profiles where id = req.user_id), 1
  );
  update public.device_link_requests set status = 'consumed', consumed_at = now(),
    transfer_envelope = null, confirmation_token_hash = null where id = link_request_id;
end;
$$;

revoke all on function public.current_active_device() from public, anon;
revoke all on function public.request_device_link(uuid,text,text,text) from public, anon;
revoke all on function public.get_device_link(uuid) from public, anon;
revoke all on function public.list_pending_device_links() from public, anon;
revoke all on function public.approve_device_link(uuid,jsonb,text) from public, anon;
revoke all on function public.deny_device_link(uuid) from public, anon;
revoke all on function public.cancel_device_link(uuid) from public, anon;
revoke all on function public.confirm_device_link(uuid,text) from public, anon;
grant execute on function public.request_device_link(uuid,text,text,text) to authenticated;
grant execute on function public.get_device_link(uuid) to authenticated;
grant execute on function public.list_pending_device_links() to authenticated;
grant execute on function public.approve_device_link(uuid,jsonb,text) to authenticated;
grant execute on function public.deny_device_link(uuid) to authenticated;
grant execute on function public.cancel_device_link(uuid) to authenticated;
grant execute on function public.confirm_device_link(uuid,text) to authenticated;

-- The account encryption identity is immutable in normal profile edits. This
-- preserves avatar updates while preventing stale clients or an authenticated
-- session from silently replacing the key used by established ciphertext.
create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id or new.username <> old.username or new.public_key <> old.public_key then
    raise exception 'PROFILE_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_identity_update on public.profiles;
create trigger protect_profile_identity_update
before update on public.profiles
for each row execute function public.protect_profile_identity();

commit;
