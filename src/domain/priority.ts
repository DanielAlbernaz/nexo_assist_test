import type { Affected, Priority, TicketType } from "./types";

export interface PriorityInput {
  type: TicketType;
  affected: Affected;
  /** O problema impede alguém de trabalhar (ou algo está parado). */
  blocking: boolean;
  /** Há um compromisso no mesmo dia em risco. */
  sameDayCommitment: boolean;
}

/**
 * Prioridade = impacto × urgência, conforme a tabela do Anexo A.
 * O modelo só extrai os fatos (quem é afetado, se bloqueia, se há compromisso);
 * a decisão é determinística e testável.
 */
export function computePriority(input: PriorityInput): Priority {
  const widespread = input.affected === "team" || input.affected === "company";
  if (widespread && input.blocking) return "Crítica";
  if (input.blocking || input.sameDayCommitment) return "Alta";
  if (input.type === "REQ") return "Baixa";
  return "Média";
}
