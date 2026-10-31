import type { Affected, Category, Priority, Ticket, TicketType } from "@/domain/types";

/** Chamado com os campos calculados que a interface precisa. */
export interface TicketView extends Ticket {
  deadline: number;
  overdue: boolean;
  slaLabel: string;
}

export type DraftAction = "create" | "update" | "reopen";

export interface DraftPayload {
  action: DraftAction;
  targetTicketId: string | null;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  affected: Affected;
  priority: Priority;
  /** Texto a acrescentar (update) ou motivo (reopen). */
  note: string | null;
}

export interface DraftView extends DraftPayload {
  id: string;
  status: "pending" | "confirmed" | "cancelled";
  deadline: number;
  slaLabel: string;
}

export type HandoffReason = "user_request" | "critical" | "overdue" | "low_confidence";

/** Passo executado pelo agent, mostrado acima da resposta (transparência). */
export interface AgentStep {
  id: string;
  tool: string;
  label: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  ms: number;
}

/** Elementos ricos da mensagem, além do texto. */
export type Block =
  | { kind: "choices"; options: string[] }
  | { kind: "ticket-choice"; tickets: TicketView[] }
  | { kind: "ticket-card"; ticket: TicketView }
  | { kind: "draft"; draft: DraftView }
  | { kind: "ticket-result"; action: DraftAction; ticket: TicketView };

export interface MessageParts {
  steps?: AgentStep[];
  blocks?: Block[];
  /** Para mensagens de analista: quem escreveu. */
  author?: { name: string; level: string | null };
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "agent" | "analyst" | "system";
  content: string;
  parts: MessageParts | null;
  createdAt: number;
}

export type ConversationState = "agent" | "waiting_analyst" | "with_analyst" | "closed";
