import { useEffect, useRef, useState } from "react";
import { Banner, Button, ProgressBar, Sheet, Spinner } from "@mayak/ui";
import {
  cancelDownload,
  cancelTranscription,
  dictationSupported,
  downloadModel,
  MAX_SECONDS,
  modelStatus,
  startRecording,
  transcribe,
  type ModelStatus,
  type Recording,
  type RecorderError,
} from "../state/dictation.ts";
import { Icon } from "./Icon.tsx";

/**
 * Диктовка (design/VOICE-DICTATION.md): состояния «готово», «запрос разрешения»,
 * «слушаю», «распознаю», ошибки — текстом, не только цветом. Микрофон включается
 * только по нажатию «Начать» и освобождается сразу при остановке, отмене или закрытии.
 */
type State =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "need-model"; status: ModelStatus; error?: string }
  | { kind: "downloading"; status: ModelStatus; received: number }
  | { kind: "ready"; status: ModelStatus }
  | { kind: "permission"; status: ModelStatus }
  | { kind: "listening"; status: ModelStatus }
  | { kind: "recognizing"; status: ModelStatus }
  | { kind: "error"; status: ModelStatus; message: string };

const ERRORS: Record<RecorderError | "no-speech" | "failed", string> = {
  denied: "Доступ к микрофону запрещён. Разрешите его «Маяку» в настройках системы и повторите.",
  "no-microphone": "Микрофон не найден. Подключите микрофон и повторите.",
  unavailable: "Микрофон сейчас недоступен — возможно, его занимает другая программа.",
  "no-speech": "Речь не распознана. Говорите ближе к микрофону и повторите.",
  failed: "Не удалось распознать речь. Повторите попытку.",
};

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} МБ`;

export function DictationSheet({ onClose, onText }: { onClose: () => void; onText: (text: string) => void }) {
  const [state, setState] = useState<State>({ kind: dictationSupported() ? "loading" : "unsupported" });
  const recording = useRef<Recording | null>(null);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!dictationSupported()) return;
    modelStatus()
      .then((status) => setState(status.installed ? { kind: "ready", status } : { kind: "need-model", status }))
      .catch(() => setState({ kind: "unsupported" }));
  }, []);

  // Закрытие окна или уход из заметки: запись и распознавание прекращаются.
  useEffect(
    () => () => {
      recording.current?.cancel();
      recording.current = null;
      void cancelTranscription().catch(() => undefined);
      void cancelDownload().catch(() => undefined);
    },
    [],
  );

  // Индикатор громкости и предел длительности во время записи.
  useEffect(() => {
    if (state.kind !== "listening") return;
    const timer = setInterval(() => {
      const r = recording.current;
      if (!r) return;
      setLevel(r.level());
      setSeconds(r.seconds());
      if (r.seconds() >= MAX_SECONDS) void stop();
    }, 100);
    return () => clearInterval(timer);
  });

  const download = async (status: ModelStatus) => {
    setState({ kind: "downloading", status, received: 0 });
    try {
      await downloadModel(status.model, (received) => setState({ kind: "downloading", status, received }));
      setState({ kind: "ready", status: { ...status, installed: true } });
    } catch (error) {
      const message = String(error);
      setState({ kind: "need-model", status, error: message === "cancelled" ? undefined : message });
    }
  };

  const start = async (status: ModelStatus) => {
    setState({ kind: "permission", status });
    try {
      recording.current = await startRecording();
      setSeconds(0);
      setState({ kind: "listening", status });
    } catch (error) {
      const code = ((error as { code?: RecorderError }).code ?? "unavailable") as RecorderError;
      setState({ kind: "error", status, message: ERRORS[code] });
    }
  };

  const stop = async () => {
    if (state.kind !== "listening" || !recording.current) return;
    const { status } = state;
    const samples = recording.current.stop();
    recording.current = null;
    setState({ kind: "recognizing", status });
    try {
      const text = await transcribe(status.model, samples);
      if (!text) return setState({ kind: "error", status, message: ERRORS["no-speech"] });
      onText(text);
      onClose();
    } catch (error) {
      if (String(error) === "cancelled") return setState({ kind: "ready", status });
      setState({ kind: "error", status, message: ERRORS.failed });
    }
  };

  const cancel = () => {
    if (state.kind === "listening") {
      recording.current?.cancel();
      recording.current = null;
      setState({ kind: "ready", status: state.status });
    } else if (state.kind === "recognizing") {
      void cancelTranscription();
    } else if (state.kind === "downloading") {
      void cancelDownload();
    } else {
      onClose();
    }
  };

  const actions = (() => {
    switch (state.kind) {
      case "need-model":
        return (
          <>
            <Button onClick={onClose}>Не сейчас</Button>
            <Button variant="primary" onClick={() => void download(state.status)}>
              Скачать модель · {mb(state.status.size)}
            </Button>
          </>
        );
      case "downloading":
      case "recognizing":
        return <Button onClick={cancel}>Отменить</Button>;
      case "ready":
      case "error":
        return (
          <>
            <Button onClick={onClose}>Закрыть</Button>
            <Button variant="primary" icon={<Icon name="mic" />} onClick={() => void start(state.status)}>
              {state.kind === "error" ? "Повторить" : "Начать запись"}
            </Button>
          </>
        );
      case "listening":
        return (
          <>
            <Button onClick={cancel}>Отменить</Button>
            <Button variant="primary" onClick={() => void stop()}>
              Готово
            </Button>
          </>
        );
      default:
        return <Button onClick={onClose}>Закрыть</Button>;
    }
  })();

  return (
    <Sheet title="Диктовка" onClose={cancel} actions={actions}>
      <div className="dictation" aria-live="polite">
        {state.kind === "loading" && <Spinner label="Проверяем модель распознавания" />}
        {state.kind === "unsupported" && (
          <p>
            Диктовка работает в приложении «Маяк» для компьютера и телефона: речь распознаётся прямо на устройстве. В
            браузере пользуйтесь системной диктовкой.
          </p>
        )}
        {state.kind === "need-model" && (
          <>
            <p>
              Для диктовки нужна модель распознавания русской речи ({mb(state.status.size)}). Она скачивается один раз и
              работает на этом устройстве без интернета — звук никуда не отправляется.
            </p>
            {state.error && (
              <Banner tone="danger" role="alert">
                {state.error}
              </Banner>
            )}
          </>
        )}
        {state.kind === "downloading" && (
          <>
            <p>Скачиваем модель распознавания… {mb(state.received)} из {mb(state.status.size)}</p>
            <ProgressBar label="Загрузка модели" value={state.received} max={state.status.size} />
          </>
        )}
        {state.kind === "ready" && <p>Нажмите «Начать запись» и говорите по-русски. Текст вставится туда, где стоял курсор.</p>}
        {state.kind === "permission" && <p>Разрешите доступ к микрофону, если система спросит.</p>}
        {state.kind === "listening" && (
          <div className="dictation__listening">
            <span className="dictation__mic" style={{ ["--level" as string]: level.toFixed(2) }} aria-hidden="true">
              <Icon name="mic" />
            </span>
            <p>
              <strong>Слушаю…</strong>{" "}
              <span aria-hidden="true">
                {Math.floor(seconds / 60)}:{String(Math.floor(seconds % 60)).padStart(2, "0")}
              </span>
              <br />
              <span className="mk-secondary">Нажмите «Готово», когда закончите.</span>
            </p>
          </div>
        )}
        {state.kind === "recognizing" && (
          <div className="dictation__listening">
            <Spinner label="Распознаём речь" />
            <p>
              <strong>Распознаём…</strong> Это может занять несколько секунд.
            </p>
          </div>
        )}
        {state.kind === "error" && (
          <Banner tone="danger" role="alert">
            {state.message}
          </Banner>
        )}
      </div>
    </Sheet>
  );
}
