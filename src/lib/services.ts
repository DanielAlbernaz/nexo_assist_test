import { db } from "@/db/client";
import { createHttpTicketClient, fetchTransport } from "@/ticket-service/http-client";
import { createInProcessTicketClient } from "@/ticket-service/in-process";
import { config } from "./config";
import { ticketBackend } from "./ticket-backend";

/**
 * O agent e as rotas falam com o sistema de chamados pelo contrato HTTP
 * (`/api/ticket-service/*`): serialização, token, códigos de status e retry são
 * os mesmos de um serviço remoto. Com TICKET_SERVICE_URL a chamada sai pela rede;
 * sem ela, o mesmo handler é invocado dentro do processo (um deploy só, sem
 * depender de a função serverless alcançar a própria URL).
 */
export const tickets = config.ticketService.url
  ? createHttpTicketClient(fetchTransport(config.ticketService.url, ticketBackend.token))
  : createInProcessTicketClient(ticketBackend.service, ticketBackend.token);
export { db };
