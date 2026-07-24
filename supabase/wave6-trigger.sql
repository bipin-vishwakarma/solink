-- ============================================================================
-- Solink — Wave 6: fire a push when a new message is inserted
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER deploying the send-push function.
-- Uses pg_net to POST to the send-push Edge Function with the recipient's id.
-- The server never sees plaintext, so the push payload is always content-free.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
as $$
declare
  recipient uuid;
begin
  -- CRITICAL: this runs AFTER INSERT in the same txn, so any error here would
  -- roll back the message insert. Guard everything so a push failure can NEVER
  -- block message delivery.
  begin
    select user_id into recipient
    from public.conversation_members
    where conversation_id = NEW.conversation_id
      and user_id <> NEW.sender_id
    limit 1;

    if recipient is not null then
      perform net.http_post(
        url := 'https://zfkxtakrcsqncdxslsvx.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer sb_publishable_GdBDtzb7olfru14Kaauoxw_FVhdrn9v'
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
