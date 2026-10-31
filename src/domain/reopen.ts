import type { Ticket } from "./types";

export const REOPEN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Chamados resolvidos há até 7 dias podem ser reabertos. */
export function canReopen(
  ticket: Pick<Ticket, "status" | "resolvedAt">,
  now: number,
): boolean {
  if (ticket.status !== "Resolvido" || ticket.resolvedAt === null) return false;
  return now - ticket.resolvedAt <= REOPEN_WINDOW_DAYS * DAY_MS;
}
