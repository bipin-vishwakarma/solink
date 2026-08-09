-- ============================================================================
-- Solink — Wave 6: fire a push when a new message is inserted
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER deploying the send-push function.
-- Uses pg_net to POST to the send-push Edge Function with the recipient's id.
-- The function URL and a dedicated webhook secret are read from Supabase Vault;
-- neither credential belongs in this repository.
-- The server never sees plaintext, so the push payload is always content-free.
-- ============================================================================

create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault, pg_temp
as $$
declare
  recipient uuid;
  function_url text;
  webhook_secret text;
begin
  -- CRITICAL: this runs AFTER INSERT in the same txn, so any error here would
  -- roll back the message insert. Guard everything so a push failure can NEVER
  -- block message delivery.
  begin
    select decrypted_secret into function_url
    from vault.decrypted_secrets
    where name = 'solink_send_push_url'
    order by created_at desc
    limit 1;

    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'solink_push_webhook_secret'
    order by created_at desc
    limit 1;

    -- Push remains optional. If Vault is not configured, message delivery still
    -- succeeds and no external request is attempted.
    if function_url is null or webhook_secret is null then
      return NEW;
    end if;

    select user_id into recipient
    from public.conversation_members
    where conversation_id = NEW.conversation_id
      and user_id <> NEW.sender_id
    limit 1;

    if recipient is not null then
      perform net.http_post(
        url := function_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Solink-Push-Secret', webhook_secret
        ),
        body := jsonb_build_object('recipientId', recipient::text, 'disguised', true)
      );
    end if;
  exception when others then
    null;  -- swallow push errors; message delivery must always succeed
  end;
  return NEW;
end;
$$;

drop trigger if exists on_message_insert on public.messages;
create trigger on_message_insert
  after insert on public.messages
  for each row execute function public.notify_new_message();
