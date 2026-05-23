export type Phase = "b-pre" | "c" | "b-post";
export const PHASES: Phase[] = ["b-pre", "c", "b-post"];

export type Message = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

export type ProjectMeta = {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type PhaseConversation = {
  messages: Message[];
  /** Optional for backwards compat with pre-history-feature data. */
  createdAt?: string;
  updatedAt: string;
};

export type SessionMeta = {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ArchivedSession = {
  id: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};
