/**
 * Раздел файлов. Загрузка требует облачного хранилища (приватный Vercel Blob),
 * которое ещё не подключено, поэтому экран честно показывает ограничение.
 */
export function FilesScreen() {
  return (
    <article className="sheet">
      <div className="eyebrow accent">Под рукой на всех устройствах</div>
      <div className="page-heading">
        <h1 className="page-title">Ваши файлы</h1>
        <button type="button" className="button primary" disabled aria-describedby="files-unavailable">
          Добавить файл
        </button>
      </div>
      <p className="intro">Добавьте файл, чтобы открыть его на другом устройстве.</p>
      <div className="banner" id="files-unavailable">
        <p>
          Файлы появятся в следующей версии. Для загрузки нужно облачное хранилище, которое ещё не подключено, поэтому
          выбор файла сейчас недоступен.
        </p>
      </div>
      <div className="cloud-explain">
        <strong>Копия или синхронизация?</strong>
        <br />
        Вложения и отдельные файлы будут храниться в вашем облачном аккаунте и открываться на любом устройстве.
        «Передать копию» отправит независимую копию конкретному устройству.
      </div>
    </article>
  );
}
