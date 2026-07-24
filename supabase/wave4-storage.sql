-- ============================================================================
-- Solink — Wave 4: Encrypted attachment storage
-- ============================================================================
-- Run this in the Supabase SQL Editor (or create the bucket in the Dashboard).
--
-- Security rationale:
--   The bytes stored in the `attachments` bucket are ALREADY end-to-end
--   encrypted ciphertext produced on the client. The encryption key never
--   touches the server, so authenticated read access to the raw (encrypted)
--   bytes is acceptable — a reader without the key sees only random bytes.
--   Files are stored at path `<conversation_id>/<uuid>`.
-- ============================================================================

-- 1. Create a PRIVATE storage bucket named `attachments`.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- 2. RLS policies on storage.objects, scoped to bucket_id = 'attachments'.
--    (RLS is already enabled on storage.objects by Supabase.)

-- Allow authenticated users to UPLOAD (INSERT) encrypted attachments.
drop policy if exists "attachments: authenticated can upload" on storage.objects;
create policy "attachments: authenticated can upload"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'attachments');

-- Allow authenticated users to READ (SELECT) encrypted attachments.
-- Safe because the bytes are E2E-encrypted ciphertext (see rationale above).
drop policy if exists "attachments: authenticated can read" on storage.objects;
create policy "attachments: authenticated can read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'attachments');

-- Allow authenticated users to DELETE only the objects they uploaded.
drop policy if exists "attachments: owner can delete" on storage.objects;
create policy "attachments: owner can delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'attachments' and owner = auth.uid());
