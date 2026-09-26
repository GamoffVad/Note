-- Маяк · 0001 · аккаунты, устройства, заметки и журнал синхронизации.
-- ТЗ, раздел 3. Все объекты пользователя адресуются парой (owner_id, id):
-- чужой id в запросе не находит строку и не раскрывает её существование.

create table users (
  id            uuid primary key default gen_random_uuid(),
  auth_subject  text not null unique,
  locale        text not null default 'ru',
  quota_bytes   bigint not null default 2147483648,
  created_at    timestamptz not null default now()
);

create table devices (
  owner_id      uuid not null references users(id) on delete cascade,
  id            uuid not null,
  name          text not null,
  platform      text not null check (platform in ('windows','macos','linux','android','ios','web')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz,
  primary key (owner_id, id)
);
-- deviceId уникален глобально: чужой клиент не может зарегистрировать тот же id.
create unique index devices_id_unique on devices(id);

-- Голова журнала владельца. Строка блокируется (FOR UPDATE) на время записи:
-- seq выдаётся и фиксируется строго по очереди, курсор не пропускает коммиты.
create table sync_heads (
  owner_id      uuid primary key references users(id) on delete cascade,
  last_seq      bigint not null default 0,
  -- Эпоха журнала: смена (например, после восстановления из backup) делает старые курсоры недействительными.
  epoch         integer not null default 1,
  -- События с seq < retained_from_seq удалены очисткой; более старые курсоры получают 410.
  retained_from_seq bigint not null default 1
);

create table notes (
  owner_id      uuid not null references users(id) on delete cascade,
  id            uuid not null,
  title         text not null,
  document      jsonb not null,
  tags          text[] not null default '{}',
  pinned        boolean not null default false,
  revision      bigint not null check (revision > 0),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (owner_id, id)
);

create table note_versions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null,
  note_id          uuid not null,
  revision         bigint not null,
  snapshot         jsonb not null,
  deleted          boolean not null,
  source_device_id uuid,
  created_at       timestamptz not null default now(),
  unique (owner_id, note_id, revision),
  foreign key (owner_id, note_id) references notes(owner_id, id) on delete cascade
);

create table changes (
  owner_id      uuid not null references users(id) on delete cascade,
  seq           bigint not null,
  entity_type   text not null,
  entity_id     uuid not null,
  revision      bigint not null,
  operation     text not null,
  mutation_id   uuid,
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  primary key (owner_id, seq)
);

-- Результаты применённых мутаций для идемпотентных повторов (хранить ≥ 90 дней).
create table mutations (
  owner_id      uuid not null references users(id) on delete cascade,
  mutation_id   uuid not null,
  request_hash  text not null,
  result        jsonb not null,
  created_at    timestamptz not null default now(),
  primary key (owner_id, mutation_id)
);

-- Окончательно удалённые id нельзя создать повторно: запись не воскрешается.
create table purged_ids (
  owner_id      uuid not null references users(id) on delete cascade,
  entity_type   text not null,
  entity_id     uuid not null,
  purged_at     timestamptz not null default now(),
  primary key (owner_id, entity_type, entity_id)
);

-- Диагностика: докуда устройство дочитало журнал. Не доказательство получения файла.
create table device_cursors (
  owner_id      uuid not null,
  device_id     uuid not null,
  last_ack_seq  bigint not null,
  updated_at    timestamptz not null default now(),
  primary key (owner_id, device_id),
  foreign key (owner_id, device_id) references devices(owner_id, id) on delete cascade
);
