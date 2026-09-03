-- Handbook: real file upload, not just a pasted link (Melissa's call,
-- 2026-09-02) -- mirrors the Documents card's storage pattern
-- (lib/data.js's uploadDocument / the `documents` bucket), but company-wide
-- and HR-only instead of pair-scoped: no <pair_id>/ prefix on the storage
-- path, and RLS uses is_hr() (added in 0013_global_handbook.sql) instead of
-- is_pair_member().

alter table handbook_links alter column url drop not null;
alter table handbook_links add column storage_path text;
alter table handbook_links add column size bigint;
alter table handbook_links add column mime_type text;

insert into storage.buckets (id, name, public) values ('handbook', 'handbook', false);

create policy "any signed-in user can read handbook files" on storage.objects
  for select using (bucket_id = 'handbook' and auth.uid() is not null);
create policy "hr can upload handbook files" on storage.objects
  for insert with check (bucket_id = 'handbook' and is_hr());
create policy "hr can delete handbook files" on storage.objects
  for delete using (bucket_id = 'handbook' and is_hr());
