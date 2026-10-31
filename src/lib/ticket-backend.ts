import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { TicketService } from "@/ticket-service/service";
import { config } from "./config";

/**
 * Lado servidor do sistema de chamados: a instância que a rota
 * `/api/ticket-service/*` expõe. Sem TICKET_SERVICE_TOKEN o token é aleatório por
 * processo, então ninguém de fora consegue chamar a rota (só o transporte em
 * processo de `services.ts`, que conhece o token).
 */
export const ticketBackend = {
  service: new TicketService(db, {
    failureRate: config.ticketService.failureRate,
    latencyMs: config.ticketService.latencyMs,
  }),
  token: config.ticketService.token || randomUUID(),
};
