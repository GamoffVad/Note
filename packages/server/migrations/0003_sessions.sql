-- Маяк · 0003 · привязка устройства к сессии Auth-провайдера.
-- ТЗ, раздел 7: управление устройством связывается с реальной сессией.
-- Отзыв устройства запрещает и его сессию: иначе клиент мог бы
-- зарегистрироваться заново под новым deviceId с тем же токеном.

alter table devices add column session_id text;

create table revoked_sessions (
  owner_id    uuid not null references users(id) on delete cascade,
  session_id  text not null,
  revoked_at  timestamptz not null default now(),
  primary key (owner_id, session_id)
);
alter table revoked_sessions enable row level security;
