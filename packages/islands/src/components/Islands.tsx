import {
  useState,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cx } from "./util.ts";

/**
 * Компоненты «Островов идей» из DESIGN-SYSTEM.md, раздел 6: заголовок экрана,
 * метка секции, карточка заметки, изображение-герой, нижняя навигация,
 * статус синхронизации и файл.
 */

/** Заголовок экрана (32 px на телефоне, 40 px на компьютере) и действия справа. */
export function ScreenTitle({
  children,
  actions,
  as: Tag = "h1",
  subtitle,
  className,
  id,
}: {
  children: ReactNode;
  actions?: ReactNode;
  as?: "h1" | "h2" | "h3";
  subtitle?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cx("isl-screen-title", className)}>
      <div className="isl-screen-title__text">
        <Tag className="isl-screen-title__heading" id={id}>
          {children}
        </Tag>
        {subtitle && <p className="isl-screen-title__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="isl-screen-title__actions">{actions}</div>}
    </div>
  );
}

/** Метка секции списка: «ВАШИ ЗАПИСИ», «НЕДАВНИЕ». Заглавные буквы — только оформлением. */
export function SectionLabel({
  children,
  as: Tag = "h2",
  id,
}: {
  children: ReactNode;
  as?: "h2" | "h3" | "h4" | "p";
  id?: string;
}) {
  return (
    <Tag className="isl-section-label" id={id}>
      {children}
    </Tag>
  );
}

export interface NoteCardProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "title"
> {
  title: ReactNode;
  snippet?: ReactNode;
  meta?: ReactNode;
  /** Дополнительные метки справа от даты (вложения, состояние синхронизации). */
  badges?: ReactNode;
  selected?: boolean;
  pinned?: boolean;
}

/**
 * Карточка заметки: заголовок, фрагмент, дата. Выбранная — заливка, контур
 * и aria-current (выбор выражен не только цветом). Закреплённая — метка-точка
 * с текстом для чтения с экрана.
 */
export function NoteCard({
  title,
  snippet,
  meta,
  badges,
  selected,
  pinned,
  className,
  ...rest
}: NoteCardProps) {
  return (
    <a
      className={cx("isl-note-card", selected && "is-selected", className)}
      aria-current={selected ? "page" : undefined}
      {...rest}
    >
      <span className="isl-note-card__head">
        <strong className="isl-note-card__title">{title}</strong>
        {pinned && (
          <span className="isl-note-card__pin">
            <span className="isl-visually-hidden">Закреплена</span>
          </span>
        )}
      </span>
      {snippet && <span className="isl-note-card__snippet">{snippet}</span>}
      {(meta || badges) && (
        <span className="isl-note-card__meta">
          <span>{meta}</span>
          {badges}
        </span>
      )}
    </a>
  );
}

/**
 * Изображение-герой: тематическая иллюстрация со скруглением 18 px и
 * необязательной подписью на непрозрачном слое. Место под изображение
 * зарезервировано пропорцией — список не сдвигается после загрузки; при
 * ошибке остаётся фон surface-soft. Декоративное изображение скрыто от чтения с экрана.
 */
export function Hero({
  src,
  srcSet,
  title,
  caption,
  className,
}: {
  src: string;
  srcSet?: string;
  title?: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cx("isl-hero", className)}>
      <div className="isl-hero__frame">
        {!failed && (
          <img
            className="isl-hero__image"
            src={src}
            srcSet={srcSet}
            sizes="(min-width: 1024px) 60vw, 100vw"
            alt=""
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
        {(title || caption) && (
          <div className="isl-hero__caption">
            {title && <strong className="isl-hero__title">{title}</strong>}
            {caption && <span className="isl-hero__text">{caption}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Нижняя навигация телефона: четыре раздела, значок и подпись, без прокрутки. */
export function BottomNav({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <nav className={cx("isl-bottom-nav", className)} aria-label={label}>
      {children}
    </nav>
  );
}

export interface BottomNavItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon: ReactNode;
  label: ReactNode;
  selected?: boolean;
}

export function BottomNavItem({
  icon,
  label,
  selected,
  className,
  ...rest
}: BottomNavItemProps) {
  return (
    <a
      className={cx(
        "isl-bottom-nav__item",
        selected && "is-selected",
        className,
      )}
      aria-current={selected ? "page" : undefined}
      {...rest}
    >
      <span className="isl-bottom-nav__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="isl-bottom-nav__label">{label}</span>
    </a>
  );
}

export type SyncTone = "local" | "syncing" | "synced" | "action";

/**
 * Статус синхронизации: значок и текст рядом с документом или в панели
 * («Сохранено на устройстве», «Синхронизируется», «Синхронизировано»,
 * «Требуется действие»). Цвет — не единственный признак: текст обязателен.
 */
export function SyncStatus({
  tone,
  icon,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & {
  tone: SyncTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={cx("isl-sync-status", `isl-sync-status--${tone}`, className)}
      {...rest}
    >
      {icon && (
        <span className="isl-sync-status__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}

/** Файл: название, формат и размер, доступность на устройстве, действие. */
export function FileCard({
  icon,
  name,
  details,
  status,
  action,
  className,
}: {
  icon?: ReactNode;
  name: ReactNode;
  details?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("isl-file-card", className)}>
      {icon && (
        <span className="isl-file-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="isl-file-card__text">
        <strong className="isl-file-card__name">{name}</strong>
        {(details || status) && (
          <span className="isl-file-card__details">
            {details}
            {details && status ? " · " : null}
            {status}
          </span>
        )}
      </span>
      {action && <span className="isl-file-card__action">{action}</span>}
    </div>
  );
}

/** Поверхность-карточка (радиус 18 px): группы, панели, блоки на странице. */
export function Card({
  children,
  tone = "raised",
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "raised" | "soft" | "panel";
  children: ReactNode;
}) {
  return (
    <div className={cx("isl-card", `isl-card--${tone}`, className)} {...rest}>
      {children}
    </div>
  );
}
