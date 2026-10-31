import { isOverdue, SLA_LABEL, slaDeadline, ticketDeadline } from "@/domain/sla";
import type { Ticket } from "@/domain/types";
import type { DraftPayload, DraftView, TicketView } from "./types";

export function toTicketView(ticket: Ticket, now: number): TicketView {
  return {
    ...ticket,
    deadline: ticketDeadline(ticket),
    overdue: isOverdue(ticket, now),
    slaLabel: SLA_LABEL[ticket.priority],
  };
}

export function toDraftView(
  id: string,
  status: DraftView["status"],
  payload: DraftPayload,
  now: number,
): DraftView {
  return {
    ...payload,
    id,
    status,
    deadline: slaDeadline(payload.priority, now),
    slaLabel: SLA_LABEL[payload.priority],
  };
}
