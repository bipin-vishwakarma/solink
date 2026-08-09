-- One-time, service-role-only bridge for placing the push webhook secret in
-- Vault without exposing it in source control or terminal output.

begin;

create extension if not exists supabase_vault with schema vault;

create or replace function public.configure_solink_push(
  function_url text,
  webhook_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
begin
  if function_url <> 'https://zfkxtakrcsqncdxslsvx.supabase.co/functions/v1/send-push' then
    raise exception 'Unexpected function URL';
  end if;

  if webhook_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'Webhook secret must be 32 random bytes encoded as hex';
  end if;

  perform vault.create_secret(
    function_url,
    'solink_send_push_url',
    'SOLINK send-push Edge Function URL'
  );
  perform vault.create_secret(
    webhook_secret,
    'solink_push_webhook_secret',
    'Shared authentication secret for the SOLINK database push trigger'
  );
end;
$$;

revoke all on function public.configure_solink_push(text, text) from public;
revoke all on function public.configure_solink_push(text, text) from anon;
revoke all on function public.configure_solink_push(text, text) from authenticated;
grant execute on function public.configure_solink_push(text, text) to service_role;

commit;
