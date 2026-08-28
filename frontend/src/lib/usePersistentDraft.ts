import { useEffect, useMemo, useState } from "react";

type Options<T> = {
  key: string | null;
  value: T;
  savedValue: T;
  enabled?: boolean;
  restore: (value: T) => void;
};

export function usePersistentDraft<T>({
  key,
  value,
  savedValue,
  enabled = true,
  restore,
}: Options<T>) {
  const storageKey = key ? `eventpass:draft:${key}` : null;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const serialized = useMemo(() => JSON.stringify(value), [value]);
  const savedSerialized = useMemo(
    () => JSON.stringify(savedValue),
    [savedValue],
  );
  const [committedSerialized, setCommittedSerialized] =
    useState(savedSerialized);
  const dirty = enabled && serialized !== committedSerialized;

  useEffect(() => {
    if (!enabled || !storageKey || readyKey === storageKey) return;
    setCommittedSerialized(savedSerialized);
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) restore(JSON.parse(stored) as T);
    } catch {
      localStorage.removeItem(storageKey);
    }
    setReadyKey(storageKey);
  }, [enabled, readyKey, restore, savedSerialized, storageKey]);

  useEffect(() => {
    if (!enabled || !storageKey || readyKey !== storageKey) return;
    if (dirty) localStorage.setItem(storageKey, serialized);
  }, [dirty, enabled, readyKey, serialized, storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    const guardLinks = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.defaultPrevented) return;
      if (
        !window.confirm(
          "Hay cambios sin guardar. Pulsa Cancelar para volver al formulario y guardarlos, o Aceptar para salir. El borrador se conservará para cuando regreses.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [dirty]);

  function clear() {
    if (storageKey) localStorage.removeItem(storageKey);
    setCommittedSerialized(serialized);
  }

  function discard(nextValue: T) {
    if (storageKey) localStorage.removeItem(storageKey);
    setCommittedSerialized(JSON.stringify(nextValue));
    restore(nextValue);
  }

  return { dirty, clear, discard };
}
