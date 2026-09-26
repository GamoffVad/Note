import { forwardRef, useId } from "react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

const MAGNIFIER = (
  <svg viewBox="0 0 16 16" className="mk-search__icon" aria-hidden="true">
    <circle cx="7" cy="7" r="4.6" />
    <path d="m10.4 10.4 3.4 3.4" />
  </svg>
);

/** Поле поиска macOS: скруглённое, со значком лупы и кнопкой очистки. Esc очищает, повторный Esc снимает фокус. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, label, placeholder, className },
  ref,
) {
  const id = useId();
  return (
    <div role="search" className={`mk-search mk-focus-within ${className ?? ""}`}>
      <label htmlFor={id} className="mk-visually-hidden">
        {label}
      </label>
      {MAGNIFIER}
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder ?? label}
        className="mk-search__input"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          if (value) onChange("");
          else e.currentTarget.blur();
        }}
      />
      {value && (
        <button type="button" className="mk-search__clear" aria-label="Очистить поиск" onClick={() => onChange("")}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" />
            <path d="m5.5 5.5 5 5m0-5-5 5" />
          </svg>
        </button>
      )}
    </div>
  );
});
