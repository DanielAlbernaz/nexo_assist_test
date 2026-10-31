import { db } from "@/db/client";
import { createTicketClient } from "@/ticket-service/client";
import { TicketService } from "@/ticket-service/service";
import { config } from "./config";

/** Instâncias compartilhadas pelas rotas (um sistema de chamados por processo). */
const ticketService = new TicketService(db, {
  failureRate: config.ticketService.failureRate,
  latencyMs: config.ticketService.latencyMs,
});

export const tickets = createTicketClient(ticketService);
export { db };
