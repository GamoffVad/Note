import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./util.ts";

interface FieldChrome {
  label?: string;
  /** Подпись скрыта визуально, но доступна диктору. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & FieldChrome;

/** Текстовое поле «Островов»: радиус 8 px, контур 1 px, при фокусе — контур 2 px. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, leading, trailing, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={cx("isl-field", error && "is-invalid", className)}>
      {label && (
        <label htmlFor={inputId} className={cx("isl-field__label", hideLabel && "isl-visually-hidden")}>
          {label}
        </label>
      )}
      <div className="isl-field__control isl-focus-within">
        {leading && <span className="isl-field__adornment">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          className="isl-field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...rest}
        />
        {trailing && <span className="isl-field__adornment">{trailing}</span>}
      </div>
      {hint && (
        <div id={hintId} className="isl-field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="isl-field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
});

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & Omit<FieldChrome, "leading" | "trailing">;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hideLabel, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cx("isl-field", error && "is-invalid", className)}>
      {label && (
        <label htmlFor={inputId} className={cx("isl-field__label", hideLabel && "isl-visually-hidden")}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className="isl-field__control isl-field__textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        {...rest}
      />
      {hint && (
        <div id={hintId} className="isl-field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div className="isl-field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
});
