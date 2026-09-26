-- Маяк · 0002 · закрытая схема mayak.
-- В Supabase схема public публикуется через Data API (PostgREST): таблицы в ней
-- доступны ролям anon и authenticated по публикуемому ключу. Данные Маяка
-- читаются и пишутся только через наш API, поэтому живут в схеме mayak,
-- которую нельзя добавлять в «Exposed schemas».
-- Мигратор выполняет миграции с search_path = mayak, поэтому на новой базе
-- 0001 уже создаёт таблицы здесь; перенос ниже нужен для баз, где 0001
-- применялась раньше в public.

do $$
declare
  t text;
begin
  foreach t in array array['users','devices','sync_heads','notes','note_versions','changes','mutations','purged_ids','device_cursors']
  loop
    if to_regclass('public.' || t) is not null and to_regclass('mayak.' || t) is null then
      execute format('alter table public.%I set schema mayak', t);
    end if;
  end loop;
end $$;

-- Защита в глубину: RLS без политик запрещает строки всем, кроме владельца
-- таблиц (роль, от имени которой работает API и мигратор).
alter table mayak.users enable row level security;
alter table mayak.devices enable row level security;
alter table mayak.sync_heads enable row level security;
alter table mayak.notes enable row level security;
alter table mayak.note_versions enable row level security;
alter table mayak.changes enable row level security;
alter table mayak.mutations enable row level security;
alter table mayak.purged_ids enable row level security;
alter table mayak.device_cursors enable row level security;
alter table mayak.schema_migrations enable row level security;

revoke all on schema mayak from public;
revoke all on all tables in schema mayak from public;

-- Роли Supabase есть только там; на обычном PostgreSQL блок ничего не делает.
do $$
declare
  r text;
begin
  foreach r in array array['anon','authenticated','service_role']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema mayak from %I', r);
      execute format('revoke all on all tables in schema mayak from %I', r);
      execute format('revoke all on all sequences in schema mayak from %I', r);
      execute format('revoke all on all functions in schema mayak from %I', r);
      execute format('alter default privileges in schema mayak revoke all on tables from %I', r);
      execute format('alter default privileges in schema mayak revoke all on sequences from %I', r);
      execute format('alter default privileges in schema mayak revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
