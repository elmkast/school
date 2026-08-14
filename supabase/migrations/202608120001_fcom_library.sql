-- FCOM.lib private library schema.
-- Safe to run more than once in the Supabase SQL editor.

create table if not exists public.fcom_lectures (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  file_path text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.fcom_prereads (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  file_path text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.fcom_lectures enable row level security;
alter table public.fcom_prereads enable row level security;

drop policy if exists "Users manage their lectures" on public.fcom_lectures;
create policy "Users manage their lectures"
on public.fcom_lectures for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage their prereads" on public.fcom_prereads;
create policy "Users manage their prereads"
on public.fcom_prereads for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fcom-library', 'fcom-library', false, 104857600, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their library files" on storage.objects;
create policy "Users read their library files"
on storage.objects for select to authenticated
using (bucket_id = 'fcom-library' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users upload their library files" on storage.objects;
create policy "Users upload their library files"
on storage.objects for insert to authenticated
with check (bucket_id = 'fcom-library' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users update their library files" on storage.objects;
create policy "Users update their library files"
on storage.objects for update to authenticated
using (bucket_id = 'fcom-library' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'fcom-library' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their library files" on storage.objects;
create policy "Users delete their library files"
on storage.objects for delete to authenticated
using (bucket_id = 'fcom-library' and (storage.foldername(name))[1] = (select auth.uid())::text);
