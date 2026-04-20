export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Пока задано — ответ «печатается» по символам, затем переносится в text */
  streamText?: string;
  suggestions?: string[];
  action?: { type: "navigate" | "open_quick_create_appointment"; payload?: Record<string, unknown> };
};
