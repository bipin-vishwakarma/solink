-- Safe group foundation: atomic creation and composite history pagination.

begin;

create index if not exists group_messages_group_created_id_idx
  on public.group_messages(group_id, created_at, id);

create or replace function public.create_group_chat(
  group_name text,
  member_ids uuid[]
)
returns table (id uuid, name text)
language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  new_group public.groups%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(trim(group_name)) < 1 or char_length(trim(group_name)) > 80 then
    raise exception 'invalid group';
  end if;
  if coalesce(array_length(member_ids, 1), 0) > 49 then
    raise exception 'too many members';
  end if;
  if exists (
    select 1 from unnest(coalesce(member_ids, array[]::uuid[])) member_id
    where not exists (select 1 from public.profiles where profiles.id = member_id)
  ) then raise exception 'member unavailable'; end if;

  insert into public.groups(name, created_by)
  values (trim(group_name), me) returning * into new_group;

  insert into public.group_members(group_id, user_id)
  select new_group.id, member_id
  from (
    select distinct unnest(array_append(coalesce(member_ids, array[]::uuid[]), me)) member_id
  ) members;

  return query select new_group.id, new_group.name;
end;
$$;

revoke all on function public.create_group_chat(text, uuid[]) from public, anon;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;

commit;
