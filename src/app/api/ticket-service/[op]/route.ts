import { ticketBackend } from "@/lib/ticket-backend";
import { handleTicketServiceRequest } from "@/ticket-service/http";

/**
 * Sistema de chamados "legado" exposto por HTTP. Só aceita chamadas com o token
 * interno; funcionários nunca falam com esta rota, só o agent e as rotas do app.
 */
export async function POST(req: Request, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  return handleTicketServiceRequest(ticketBackend.service, ticketBackend.token, op, req);
}
