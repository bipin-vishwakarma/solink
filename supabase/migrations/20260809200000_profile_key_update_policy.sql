-- Restore the profile permissions required for an authenticated browser to
-- publish its own E2EE public key. RLS continues to prevent cross-user updates.

begin;

alter table public.profiles enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select to authenticated
  using (true);

drop policy if exists "profiles self-insert" on public.profiles;
create policy "profiles self-insert" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles self-update" on public.profiles;
create policy "profiles self-update" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

commit;
