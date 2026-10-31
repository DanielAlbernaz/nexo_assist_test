import { z } from "zod";
import { addMessage, getConversation } from "@/chat/repository";
import { apiError, isResponse, json, requireApiUser } from "@/lib/api";
import { db } from "@/lib/services";

const bodySchema = z.object({ content: z.string().trim().min(1).max(4000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const analyst = await requireApiUser("analyst");
  if (isResponse(analyst)) return analyst;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Escreva uma mensagem.");
  const conv = await getConversation(db, id);
  if (!conv) return apiError(404, "Conversa não encontrada.");
  if (conv.state !== "with_analyst" || conv.analystId !== analyst.id) {
    return apiError(409, "Assuma o atendimento para responder.");
  }
  const message = await addMessage(db, {
    conversationId: id,
    role: "analyst",
    content: parsed.data.content,
    parts: { author: { name: analyst.name, level: analyst.level } },
  });
  return json({ message });
}
