import { Banner, Button } from "@mayak/islands";
import { Icon } from "../components/Icon.tsx";

/**
 * Раздел файлов. Загрузка требует облачного хранилища (приватный Vercel Blob),
 * которое ещё не подключено, поэтому экран честно показывает ограничение.
 */
export function FilesScreen() {
  return (
    <article className="page">
      <header className="page-header page-header--actions">
        <div>
          <h1 className="page-title">Файлы</h1>
          <p className="page-subtitle">Под рукой на всех устройствах</p>
        </div>
        <Button variant="primary" icon={<Icon name="plus" />} disabled aria-describedby="files-unavailable">
          Добавить файл
        </Button>
      </header>
      <p className="intro">Добавьте файл, чтобы открыть его на другом устройстве.</p>
      <div id="files-unavailable">
        <Banner tone="info" icon={<Icon name="cloudOff" />}>
          <p>
            Файлы появятся в следующей версии. Для загрузки нужно облачное хранилище, которое ещё не подключено, поэтому
            выбор файла сейчас недоступен.
          </p>
        </Banner>
      </div>
      <div className="explain">
        <h2 className="isl-headline">
          Копия или синхронизация?
        </h2>
        <p>
          Вложения и отдельные файлы будут храниться в вашем облачном аккаунте и открываться на любом устройстве.
          «Передать копию» отправит независимую копию конкретному устройству.
        </p>
      </div>
    </article>
  );
}
