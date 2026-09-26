import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  loadAppearance,
  resolveDark,
  saveAppearance,
  type Appearance,
  type StorageLike,
} from "./appearance.ts";

interface AppearanceState {
  appearance: Appearance;
  dark: boolean;
  /** false — сохранить не удалось, выбор действует только в текущем сеансе. */
  saved: boolean | null;
  update(patch: Partial<Appearance>): void;
  reset(): void;
}

const Context = createContext<AppearanceState | null>(null);

export function useAppearance(): AppearanceState {
  const value = useContext(Context);
  if (!value) throw new Error("useAppearance вне AppearanceProvider");
  return value;
}

function storage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(() => loadAppearance(storage()));
  const [systemDark, setSystemDark] = useState(() => media?.matches ?? false);
  const [saved, setSaved] = useState<boolean | null>(null);

  // Режим «Как в системе» реагирует на смену темы ОС без перезапуска.
  useEffect(() => {
    if (!media) return;
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const dark = resolveDark(appearance.theme, systemDark);
  useEffect(() => applyAppearance(document.documentElement, appearance, dark), [appearance, dark]);

  const value = useMemo<AppearanceState>(() => {
    const commit = (next: Appearance) => {
      setAppearance(next);
      setSaved(saveAppearance(storage(), next));
    };
    return {
      appearance,
      dark,
      saved,
      update: (patch) => commit({ ...appearance, ...patch }),
      reset: () => commit({ ...DEFAULT_APPEARANCE }),
    };
  }, [appearance, dark, saved]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
