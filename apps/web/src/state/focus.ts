/**
 * Запрос фокуса на заголовок только что созданной заметки. Редактор забирает
 * запрос при монтировании — это надёжнее, чем ставить фокус по таймеру.
 */
let pendingTitleFocus: string | null = null;

export function requestTitleFocus(noteId: string): void {
  pendingTitleFocus = noteId;
}

export function takeTitleFocus(noteId: string): boolean {
  if (pendingTitleFocus !== noteId) return false;
  pendingTitleFocus = null;
  return true;
}
