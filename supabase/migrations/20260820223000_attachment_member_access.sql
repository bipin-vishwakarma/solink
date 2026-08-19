-- Restrict encrypted attachment objects to members of the conversation named
-- by the first path segment: <conversation_id>/<random-object-id>.

begin;

create or replace function public.can_access_attachment(object_name text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, storage, pg_temp
as $$
declare
  conversation_id uuid;
begin
  begin
    conversation_id := (storage.foldername(object_name))[1]::uuid;
  exception when others then
    return false;
  end;
  return public.is_member(conversation_id);
end;
$$;

revoke all on function public.can_access_attachment(text) from public, anon;
grant execute on function public.can_access_attachment(text) to authenticated;

drop policy if exists "attachments: authenticated can upload" on storage.objects;
drop policy if exists "attachments: authenticated can read" on storage.objects;
drop policy if exists "attachments: owner can delete" on storage.objects;

create policy "attachments: members can upload"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.can_access_attachment(name)
  );

create policy "attachments: members can read"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.can_access_attachment(name)
  );

create policy "attachments: uploader can delete"
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and owner = auth.uid()
    and public.can_access_attachment(name)
  );

commit;
