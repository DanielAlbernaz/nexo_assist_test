import { confirmDraft } from "@/chat/drafts";
import { apiError, isResponse, json, requireApiUser } from "@/lib/api";
import { db, tickets } from "@/lib/services";

/** Único caminho que cria/atualiza um chamado: o clique do funcionário em "Confirmar". */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser("employee");
  if (isResponse(user)) return user;
  const { id } = await params;

  try {
    const result = await confirmDraft(db, tickets, id, user.id);
    if (!result.ok) {
      return apiError(
        result.error === "not_found" ? 404 : 409,
        result.error === "not_found"
          ? "Rascunho não encontrado."
          : "Este rascunho já foi confirmado ou cancelado.",
      );
    }
    return json(result);
  } catch (err) {
    if (err instanceof Error && err.name === "TicketServiceUnavailableError") {
      // O rascunho continua pendente: o funcionário pode tentar de novo.
      return apiError(503, "O sistema de chamados está indisponível. Seu rascunho foi mantido; tente de novo em instantes.", { retryable: true });
    }
    console.error("[confirm] erro", err);
    return apiError(500, "Não foi possível confirmar agora.");
  }
}
