import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { ThreadMessage } from "../types";

const BOTTOM_THRESHOLD_PX = 80;

export function isAtBottom(el: HTMLElement, thresholdPx = BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
}

export type UseSmartAutoScrollOptions = {
  messages: ThreadMessage[];
  scrollPulse: number;
};

/**
 * FORCE: всегда вниз (монтинг, отправка) — без проверки isUserAtBottom.
 * SMART: при изменении messages / стриме — только если пользователь у низа.
 */
export function useSmartAutoScroll(
  chatRef: RefObject<HTMLDivElement | null>,
  { messages, scrollPulse }: UseSmartAutoScrollOptions
) {
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const isUserAtBottomRef = useRef(true);

  const checkIsAtBottom = useCallback((): boolean => {
    const el = chatRef.current;
    if (!el) return true;
    return isAtBottom(el, BOTTOM_THRESHOLD_PX);
  }, [chatRef]);

  const forceScrollToBottom = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;

    isUserAtBottomRef.current = true;
    setIsUserAtBottom(true);

    requestAnimationFrame(() => {
      const box = chatRef.current;
      if (!box) return;
      box.scrollTop = box.scrollHeight;
    });

    window.setTimeout(() => {
      const box = chatRef.current;
      if (!box) return;
      box.scrollTop = box.scrollHeight;
    }, 50);
  }, [chatRef]);

  useEffect(() => {
    forceScrollToBottom();
  }, [forceScrollToBottom]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;

    const handleScroll = () => {
      const at = checkIsAtBottom();
      isUserAtBottomRef.current = at;
      setIsUserAtBottom(at);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => el.removeEventListener("scroll", handleScroll);
  }, [chatRef, checkIsAtBottom, messages.length]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el || messages.length === 0) return;
    if (!isUserAtBottom) return;

    requestAnimationFrame(() => {
      const box = chatRef.current;
      if (!box) return;
      box.scrollTop = box.scrollHeight;
    });
  }, [chatRef, messages, isUserAtBottom]);

  useEffect(() => {
    if (scrollPulse === 0) return;
    const el = chatRef.current;
    if (!el || messages.length === 0) return;
    if (!isUserAtBottomRef.current) return;

    el.scrollTop = el.scrollHeight;
  }, [chatRef, scrollPulse, messages.length]);

  const jumpToBottom = useCallback(() => {
    forceScrollToBottom();
  }, [forceScrollToBottom]);

  const showScrollButton = messages.length > 0 && !isUserAtBottom;

  return { isUserAtBottom, showScrollButton, jumpToBottom, forceScrollToBottom };
}
