export const TICKET_TYPES = ["INC", "REQ"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["Crítica", "Alta", "Média", "Baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_STATUSES = [
  "Aberto",
  "Em andamento",
  "Aguardando analista",
  "Aprovado",
  "Resolvido",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Quantas pessoas o problema afeta. "unknown" é tratado como "self". */
export type Affected = "self" | "team" | "company" | "unknown";

export interface Ticket {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  affected: Affected;
  requesterId: string;
  createdAt: number;
  /** Última atualização que conta para o prazo (resposta ou atualização). */
  updatedAt: number;
  resolvedAt: number | null;
}
