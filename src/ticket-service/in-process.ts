import { handleTicketServiceRequest } from "./http";
import { createHttpTicketClient, type TicketTransport } from "./http-client";
import type { RetryOptions } from "./client";
import type { TicketService } from "./service";

/**
 * Transporte que entrega a requisição ao handler HTTP dentro do processo: passa
 * por serialização JSON, token e mapeamento de status como numa chamada de rede.
 */
export function inProcessTransport(service: TicketService, token: string): TicketTransport {
  return (op, payload) =>
    handleTicketServiceRequest(
      service,
      token,
      op,
      new Request(`http://internal/api/ticket-service/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }),
    );
}

export function createInProcessTicketClient(
  service: TicketService,
  token = "in-process",
  retry?: RetryOptions,
) {
  return createHttpTicketClient(inProcessTransport(service, token), retry);
}
