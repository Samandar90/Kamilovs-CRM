import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext";
import { aiAssistantService } from "../services/aiAssistantService";
import { AIAssistantHeader } from "../components/AIAssistantHeader";
import { AssistantMessageBlock } from "../components/AssistantMessageBlock";
import { ChatInputBar } from "../components/ChatInputBar";
import { ChatMessage } from "../components/ChatMessage";
import { ChatWorkspace } from "../components/ChatWorkspace";
import { ClearedChatEmptyState, EmptyAssistantState } from "../components/EmptyAssistantState";
import { AiIntelligenceSidebar } from "../components/AiIntelligenceSidebar";
import { TypingIndicator } from "../components/TypingIndicator";
import { getEmptyHeroActionsForRole } from "../utils/roleQuickPrompts";
import { useSmartAutoScroll } from "../hooks/useSmartAutoScroll";
import type { ThreadMessage } from "../types";
import { mergeSmartSuggestions } from "../utils/smartSuggestions";

function initialsFromUser(fullName: string | undefined, username: string | undefined): string {
  const n = (fullName ?? username ?? "U").trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return n.slice(0, 2).toUpperCase() || "U";
}

export const AIAssistantPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userAvatar = initialsFromUser(user?.fullName ?? undefined, user?.username);
  const role = user?.role;
  const heroActions = role ? getEmptyHeroActionsForRole(role) : getEmptyHeroActionsForRole("reception");

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [scrollPulse, setScrollPulse] = useState(0);
  const [showClearedPlaceholder, setShowClearedPlaceholder] = useState(false);
  const [quickSummary, setQuickSummary] = useState<{
    cards: Array<{ key: string; label: string; value: string }>;
    recommendationText: string;
  } | null>(null);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [activeQuickAction, setActiveQuickAction] = useState<"revenue" | "patients" | "load" | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef(0);

  const bumpScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      setScrollPulse((p) => p + 1);
    });
  }, []);

  const { showScrollButton, jumpToBottom, forceScrollToBottom } = useSmartAutoScroll(chatRef, {
    messages,
    scrollPulse,
  });

  useEffect(() => {
    if (!user?.id) {
      setMessages([]);
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    setChatError(null);
    void aiAssistantService
      .listMessages()
      .then((rows) => {
        if (cancelled) return;
        setMessages(
          rows.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setChatError("Не удалось загрузить историю чата.");
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const clearChat = useCallback(() => {
    setChatError(null);
    setInput("");
    setShowClearedPlaceholder(true);
    void aiAssistantService.clearMessages().then(() => {
      setMessages([]);
    });
  }, []);

  const runQuickAction = useCallback(async (kind: "revenue" | "patients" | "load") => {
    setActiveQuickAction(kind);
    setQuickError(null);
    if (!quickSummary) {
      setQuickLoading(true);
      try {
        const summary = await aiAssistantService.summary();
        setQuickSummary({
          cards: summary.cards.map((c) => ({ key: c.key, label: c.label, value: c.value })),
          recommendationText: summary.recommendationText,
        });
      } catch {
        setQuickError("Не удалось получить данные аналитики.");
        setQuickLoading(false);
        return;
      } finally {
        setQuickLoading(false);
      }
    }
  }, [quickSummary]);

  const quickActionView = (() => {
    if (!activeQuickAction) return null;
    if (quickLoading) return <p className="text-sm text-slate-500">Загрузка данных…</p>;
    if (quickError) return <p className="text-sm text-rose-600">{quickError}</p>;
    if (!quickSummary) return null;

    const byKey = (key: string) => quickSummary.cards.find((c) => c.key === key);
    if (activeQuickAction === "revenue") {
      return (
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-slate-900">{byKey("revenueToday")?.value ?? "Нет данных"}</p>
          <p className="text-slate-600">{byKey("revenue7d")?.label}: {byKey("revenue7d")?.value ?? "—"}</p>
        </div>
      );
    }
    if (activeQuickAction === "patients") {
      return (
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-slate-900">{byKey("appointmentsToday")?.value ?? "Нет данных"}</p>
          <p className="text-slate-600">{byKey("appointmentsToday")?.label ?? "Записи сегодня"}</p>
        </div>
      );
    }
    return (
      <div className="space-y-1.5 text-sm">
        <p className="font-semibold text-slate-900">{byKey("noShow30d")?.value ?? "Нет данных"}</p>
        <p className="text-slate-600">{byKey("noShow30d")?.label ?? "Нагрузка"}</p>
        {quickSummary.recommendationText ? (
          <p className="mt-2 text-xs text-slate-500">{quickSummary.recommendationText}</p>
        ) : null}
      </div>
    );
  })();

  const quickActionTitle =
    activeQuickAction === "revenue"
      ? "Выручка сегодня"
      : activeQuickAction === "patients"
        ? "Пациенты"
        : activeQuickAction === "load"
          ? "Нагрузка"
          : null;

  const quickActionRecommendation = activeQuickAction ? quickSummary?.recommendationText ?? null : null;

  const handleInputFocus = useCallback(() => {
    requestAnimationFrame(() => {
      const box = chatRef.current;
      if (!box) return;
      box.scrollTop = box.scrollHeight;
    });
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const box = chatRef.current;
        if (!box) return;
        box.scrollTop = box.scrollHeight;
      });
    });
  }, []);

  const finalizeAssistantStream = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id || !m.streamText) return m;
        return { ...m, text: m.streamText, streamText: undefined };
      })
    );
  }, []);

  const sendMessage = async (forcedText?: string) => {
    const text = (forcedText ?? input).trim();
    if (!text || sending) return;

    setShowClearedPlaceholder(false);

    setInput("");
    setSending(true);
    setChatError(null);

    forceScrollToBottom();

    try {
      const res = await aiAssistantService.ask(text);
      const rows = await aiAssistantService.listMessages();
      const next: ThreadMessage[] = rows.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
      }));
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        const answer = res.answer?.trim() || "Ответ не получен.";
        last.suggestions = mergeSmartSuggestions(res.suggestions, answer);
        last.action = res.action;
      }
      setMessages(next);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Не удалось получить ответ.");
      try {
        const rows = await aiAssistantService.listMessages();
        setMessages(
          rows.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
          }))
        );
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: "Не удалось получить ответ. Попробуйте ещё раз.",
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    void sendMessage();
    forceScrollToBottom();
  };

  const runAction = (msg: ThreadMessage) => {
    if (!msg.action) return;
    if (msg.action.type === "navigate") {
      const to = typeof msg.action.payload?.to === "string" ? msg.action.payload.to : "";
      if (to) navigate(to);
      return;
    }
    if (msg.action.type === "open_quick_create_appointment") {
      navigate("/appointments");
    }
  };

  const clearChatButton = (
    <button
      type="button"
      onClick={clearChat}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/50 bg-white/60 text-slate-400 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-red-200/60 hover:bg-red-50/80 hover:text-red-600 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300/50"
      title="Очистить чат"
      aria-label="Очистить чат"
    >
      <Trash2 className="h-[17px] w-[17px]" strokeWidth={1.75} />
    </button>
  );

  const jumpToBottomButton = showScrollButton ? (
    <button
      type="button"
      onClick={jumpToBottom}
      className="pointer-events-auto absolute bottom-[100px] right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/50 bg-white/75 text-slate-600 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-[color,box-shadow,transform] duration-300 hover:scale-105 hover:border-blue-200/80 hover:text-blue-600 hover:shadow-[0_12px_40px_rgba(0,0,0,0.1),0_0_24px_-4px_rgba(59,130,246,0.2)] active:scale-[0.97]"
      aria-label="Вниз к последним сообщениям"
    >
      <ArrowDown className="h-5 w-5" strokeWidth={2.25} />
    </button>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100/50">
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col overflow-y-auto overscroll-y-contain px-4 py-4 lg:overflow-hidden lg:px-6 lg:py-6">
        <div className="flex w-full min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
          <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
            <div className="shrink-0 space-y-3 lg:space-y-4">
              <AIAssistantHeader trailing={clearChatButton} />
              <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:p-4">
                <h2 className="text-sm font-semibold text-slate-900">Быстрые команды</h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void runQuickAction("revenue")}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
                  >
                    Выручка сегодня
                  </button>
                  <button
                    type="button"
                    onClick={() => void runQuickAction("patients")}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
                  >
                    Пациенты
                  </button>
                  <button
                    type="button"
                    onClick={() => void runQuickAction("load")}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
                  >
                    Нагрузка
                  </button>
                </div>
              </section>

              {quickActionView ? (
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-[14px] shadow-sm lg:hidden">
                  {quickActionTitle ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{quickActionTitle}</p> : null}
                  <div className="mt-2">{quickActionView}</div>
                  {quickActionRecommendation ? <p className="mt-2 text-xs text-slate-600">{quickActionRecommendation}</p> : null}
                </section>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-col pt-3 lg:flex-1 lg:min-h-0">
              <ChatWorkspace ref={chatRef} overlay={jumpToBottomButton}>
                {loadingHistory ? <p className="py-10 text-center text-sm text-neutral-500">Загрузка чата…</p> : null}
                {!loadingHistory && messages.length === 0 && !sending ? (
                  showClearedPlaceholder ? (
                    <ClearedChatEmptyState />
                  ) : (
                    <EmptyAssistantState
                      actions={heroActions}
                      disabled={sending || loadingHistory}
                      onSelect={(t) => void sendMessage(t)}
                    />
                  )
                ) : null}

                {messages.map((message, i) =>
                  message.role === "user" ? (
                    <ChatMessage key={message.id} role="user" avatarLabel={userAvatar} index={i}>
                      {message.text}
                    </ChatMessage>
                  ) : (
                    <AssistantMessageBlock
                      key={message.id}
                      message={message}
                      index={i}
                      sending={sending}
                      onFinalizeStream={finalizeAssistantStream}
                      onStreamProgress={bumpScroll}
                      onSuggestionPick={(t) => void sendMessage(t)}
                      onRunAction={runAction}
                    />
                  )
                )}

                {sending ? <TypingIndicator mode="thinking" /> : null}
                <div className="h-px w-full shrink-0 scroll-mt-6" aria-hidden />
              </ChatWorkspace>
            </div>

            <div className="sticky bottom-[70px] z-20 shrink-0 bg-gradient-to-t from-white/95 via-white/85 to-transparent pt-3 pb-2 backdrop-blur-sm lg:bottom-0 lg:border-t lg:border-white/40 lg:pt-4">
              <div className="w-full space-y-2">
                {chatError ? <p className="text-center text-xs font-medium text-red-600">{chatError}</p> : null}
                <ChatInputBar
                  value={input}
                  onChange={handleInputChange}
                  onSubmit={handleSend}
                  onFocus={handleInputFocus}
                  disabled={sending || loadingHistory}
                  placeholder="Спросите про выручку, пациентов..."
                />
              </div>
            </div>
          </div>

          <aside className="hidden min-h-0 w-full shrink-0 lg:block">
            <div className="lg:sticky lg:top-6 space-y-4">
              {quickActionView ? (
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-[14px] shadow-sm">
                  {quickActionTitle ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{quickActionTitle}</p> : null}
                  <div className="mt-2">{quickActionView}</div>
                  {quickActionRecommendation ? <p className="mt-2 text-xs text-slate-600">{quickActionRecommendation}</p> : null}
                </section>
              ) : null}
              <AiIntelligenceSidebar />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantPage;
