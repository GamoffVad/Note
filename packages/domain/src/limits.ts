/**
 * Продуктовые лимиты первой версии (ТЗ, раздел 5). Это не лимиты тарифа
 * провайдера: перед запуском их нужно сверить с действующим тарифом.
 */
export const PROTOCOL_VERSION = 1;

/** Максимальный размер сериализованного документа заметки. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
/** Максимум мутаций в одном /sync/push. */
export const MAX_MUTATIONS_PER_PUSH = 50;
/** Максимум событий на странице /sync/pull. */
export const MAX_PULL_PAGE = 200;
/** Максимум заметок на странице /bootstrap. */
export const MAX_BOOTSTRAP_PAGE = 200;
export const MAX_TITLE_LENGTH = 500;
export const MAX_TAGS = 50;
export const MAX_TAG_LENGTH = 100;
export const MAX_BLOCKS = 5_000;

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const DEFAULT_ACCOUNT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ACTIVE_DEVICES = 10;

/**
 * Максимальный размер тела /sync/push. Клиент собирает пакет с учётом этого
 * лимита; одна заметка (≤ 1 MiB) всегда помещается. Значение нужно сверить
 * с лимитом тела запроса выбранной платформы.
 */
export const MAX_PUSH_BODY_BYTES = 4 * 1024 * 1024;
