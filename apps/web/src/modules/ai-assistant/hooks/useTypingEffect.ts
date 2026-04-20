import { useEffect, useRef, useState } from "react";

export type UseTypingEffectOptions = {
  /** Интервал между символами, мс (~14 ≈ средняя скорость) */
  msPerChar?: number;
  onComplete?: () => void;
  onProgress?: () => void;
};

/**
 * Печать текста по символам. Не блокирует UI (асинхронные таймеры).
 */
export function useTypingEffect(fullText: string, options: UseTypingEffectOptions = {}) {
  const { msPerChar = 11, onComplete, onProgress } = options;
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;

  useEffect(() => {
    if (!fullText) {
      setDisplayedText("");
      setIsComplete(true);
      return;
    }

    setDisplayedText("");
    setIsComplete(false);

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const step = (index: number) => {
      if (cancelled) return;
      const next = fullText.slice(0, index);
      setDisplayedText(next);
      if (index >= 1) {
        onProgressRef.current?.();
      }

      if (index >= fullText.length) {
        setIsComplete(true);
        onCompleteRef.current?.();
        return;
      }

      timeoutId = setTimeout(() => step(index + 1), msPerChar);
    };

    timeoutId = setTimeout(() => step(1), msPerChar);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fullText, msPerChar]);

  return { displayedText, isComplete };
}
