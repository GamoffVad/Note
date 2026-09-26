import { forwardRef } from "react";
import { Icon } from "./Icon.tsx";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Локальный поиск. Esc очищает запрос, повторный Esc снимает фокус. */
export const SearchField = forwardRef<HTMLInputElement, Props>(function SearchField({ value, onChange }, ref) {
  return (
    <div className="search" role="search">
      <Icon name="search" size={16} />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder="Найти заметку"
        aria-label="Поиск заметок"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          if (value) onChange("");
          else event.currentTarget.blur();
        }}
      />
      {value && (
        <button type="button" className="icon-button small" aria-label="Очистить поиск" onClick={() => onChange("")}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
});
