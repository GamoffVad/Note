-- Передача файлов между своими устройствами (вкладка «Файлы»).
-- Только для проекта Supabase: использует auth.uid() и Supabase Storage,
-- поэтому не входит в миграции packages/server (они идут и в чистый PostgreSQL).
--
-- Файл лежит в приватной корзине transfers по пути <user_id>/<id>;
-- название, размер и устройство-отправитель — в public.transfers.
-- Каждый видит и удаляет только свои записи и файлы (RLS).
-- Срок — 7 дней: просроченные удаляет приложение владельца (storage API),
-- записи старше срока не показываются.

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  size bigint not null check (size >= 0 and size <= 52428800),
  mime text not null default 'application/octet-stream',
  device_name text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists transfers_user_created on public.transfers (user_id, created_at desc);

alter table public.transfers enable row level security;

revoke all on public.transfers from anon;
grant select, insert, delete on public.transfers to authenticated;

drop policy if exists "transfers: свои записи" on public.transfers;
create policy "transfers: свои записи" on public.transfers
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "transfers: добавить свою" on public.transfers;
create policy "transfers: добавить свою" on public.transfers
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "transfers: удалить свою" on public.transfers;
create policy "transfers: удалить свою" on public.transfers
  for delete to authenticated using (user_id = (select auth.uid()));

-- Приватная корзина, файл не больше 50 МБ (предел бесплатного тарифа).
insert into storage.buckets (id, name, public, file_size_limit)
values ('transfers', 'transfers', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "transfers: читать свои файлы" on storage.objects;
create policy "transfers: читать свои файлы" on storage.objects
  for select to authenticated
  using (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "transfers: загружать свои файлы" on storage.objects;
create policy "transfers: загружать свои файлы" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "transfers: удалять свои файлы" on storage.objects;
create policy "transfers: удалять свои файлы" on storage.objects
  for delete to authenticated
  using (bucket_id = 'transfers' and (storage.foldername(name))[1] = (select auth.uid())::text);
