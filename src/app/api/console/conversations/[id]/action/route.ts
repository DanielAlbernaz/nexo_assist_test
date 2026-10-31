import { z } from "zod";
import { addMessage, getConversation, setState } from "@/chat/repository";
import { apiError, isResponse, json, requireApiUser } from "@/lib/api";
import { db } from "@/lib/services";

const bodySchema = z.object({ action: z.enum(["assume", "return", "close"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const analyst = await requireApiUser("analyst");
  if (isResponse(analyst)) return analyst;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Ação inválida.");
  const conv = await getConversation(db, id);
  if (!conv) return apiError(404, "Conversa não encontrada.");
  const { action } = parsed.data;
  const level = analyst.level ? ` · Suporte ${analyst.level}` : "";

  if (action === "assume") {
    if (conv.state === "closed") return apiError(409, "Esta conversa já foi encerrada.");
    if (conv.state === "with_analyst" && conv.analystId !== analyst.id) {
      return apiError(409, "Outro analista já assumiu esta conversa.");
    }
    await setState(db, id, "with_analyst", { analystId: analyst.id });
    await addMessage(db, {
      conversationId: id,
      role: "system",
      content: `${analyst.name} assumiu${level} · agent pausado`,
    });
  } else {
    // Devolver e encerrar só valem para quem está atendendo.
    if (conv.state !== "with_analyst" || conv.analystId !== analyst.id) {
      return apiError(409, "Assuma a conversa antes de devolver ou encerrar.");
    }
    if (action === "return") {
      await setState(db, id, "agent", { analystId: null, handoffAt: null, handoffReason: null, confidence: null });
      await addMessage(db, {
        conversationId: id,
        role: "system",
        content: `${analyst.name} devolveu a conversa ao agent`,
      });
    } else {
      await setState(db, id, "closed");
      await addMessage(db, {
        conversationId: id,
        role: "system",
        content: `Atendimento encerrado por ${analyst.name}`,
      });
    }
  }
  return json({ ok: true });
}
