import { addBusinessHours, BUSINESS_HOURS_PER_DAY } from "./business-hours";
import type { Priority, Ticket } from "./types";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Prazos do Anexo A. Crítica é 1 hora corrida (há plantão 24h para chamados
 * críticos). As demais contam em horas úteis; um "dia útil" vale o expediente
 * inteiro (10h), então 3 dias úteis = 30h úteis e 5 dias úteis = 50h úteis.
 */
export type SlaRule =
  | { kind: "wall-clock"; hours: number }
  | { kind: "business"; hours: number };

export const SLA_RULES: Record<Priority, SlaRule> = {
  Crítica: { kind: "wall-clock", hours: 1 },
  Alta: { kind: "business", hours: 4 },
  Média: { kind: "business", hours: 3 * BUSINESS_HOURS_PER_DAY },
  Baixa: { kind: "business", hours: 5 * BUSINESS_HOURS_PER_DAY },
};

export const SLA_LABEL: Record<Priority, string> = {
  Crítica: "1 hora",
  Alta: "4 horas úteis",
  Média: "3 dias úteis",
  Baixa: "5 dias úteis",
};

/** Instante limite para a próxima resposta/atualização, a partir de `from`. */
export function slaDeadline(priority: Priority, from: number): number {
  const rule = SLA_RULES[priority];
  return rule.kind === "wall-clock"
    ? from + rule.hours * HOUR_MS
    : addBusinessHours(from, rule.hours);
}

/** O prazo conta desde a última atualização, não desde a abertura. */
export function ticketDeadline(ticket: Pick<Ticket, "priority" | "updatedAt">): number {
  return slaDeadline(ticket.priority, ticket.updatedAt);
}

export function isOverdue(
  ticket: Pick<Ticket, "priority" | "updatedAt" | "status">,
  now: number,
): boolean {
  if (ticket.status === "Resolvido") return false;
  return now > ticketDeadline(ticket);
}
