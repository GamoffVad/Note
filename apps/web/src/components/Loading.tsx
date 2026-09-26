import { Spinner } from "@mayak/ui";

/** Строка загрузки: индикатор библиотеки объявляет текст, видимая подпись дублирует его только глазами. */
export function Loading({ text }: { text: string }) {
  return (
    <p className="loading-line">
      <Spinner size="small" label={text} />
      <span aria-hidden="true">{text}</span>
    </p>
  );
}
