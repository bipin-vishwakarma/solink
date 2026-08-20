-- Make device-link approval idempotent so a retry after a lost HTTP response
-- cannot turn a successful approval into a misleading client error.

begin;

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
  if req.user_id <> auth.uid() or req.expires_at <= now() then
    raise exception 'LINK_REQUEST_UNAVAILABLE';
  end if;
  if req.status = 'approved'
    and req.approved_by_device_id = approver.id
    and req.transfer_envelope = transfer_payload
    and req.confirmation_token_hash = approve_device_link.confirmation_token_hash then
    return;
  end if;
  if req.status <> 'pending' then raise exception 'LINK_REQUEST_UNAVAILABLE'; end if;
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

revoke all on function public.approve_device_link(uuid,jsonb,text) from public, anon;
grant execute on function public.approve_device_link(uuid,jsonb,text) to authenticated;

commit;
