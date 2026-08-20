-- Qualify the conflict target because RETURNS TABLE exposes an output variable
-- named id inside PL/pgSQL.

create or replace function public.send_message_once(
  message_id uuid,
  target_conversation uuid,
  encrypted_ciphertext text,
  encrypted_iv text
)
returns table (id uuid, created_at timestamptz)
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  existing public.messages%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if length(encrypted_ciphertext) > 1000000 or length(encrypted_iv) > 256 then
    raise exception 'message unavailable';
  end if;

  select messages.* into existing from public.messages where messages.id = message_id;
  if found then
    if existing.sender_id <> me
       or existing.conversation_id <> target_conversation
       or existing.ciphertext <> encrypted_ciphertext
       or existing.iv <> encrypted_iv then
      raise exception 'message id unavailable';
    end if;
    return query select existing.id, existing.created_at;
    return;
  end if;

  insert into public.messages(id, conversation_id, sender_id, ciphertext, iv)
  values (message_id, target_conversation, me, encrypted_ciphertext, encrypted_iv)
  on conflict on constraint messages_pkey do nothing;

  select messages.* into existing from public.messages where messages.id = message_id;
  if not found
     or existing.sender_id <> me
     or existing.conversation_id <> target_conversation
     or existing.ciphertext <> encrypted_ciphertext
     or existing.iv <> encrypted_iv then
    raise exception 'message id unavailable';
  end if;

  return query select existing.id, existing.created_at;
end;
$$;

revoke all on function public.send_message_once(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.send_message_once(uuid, uuid, text, text)
  to authenticated;
