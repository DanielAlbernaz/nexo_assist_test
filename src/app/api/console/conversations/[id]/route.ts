import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { handoffInfo } from "@/chat/handoff";
import { getConversation, listMessages } from "@/chat/repository";
import type { HandoffReason } from "@/chat/types";
import { toTicketView } from "@/chat/views";
import { apiError, isResponse, json, requireApiUser } from "@/lib/api";
import { db, tickets } from "@/lib/services";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const analyst = await requireApiUser("analyst");
  if (isResponse(analyst)) return analyst;
  const { id } = await params;

  const conv = await getConversation(db, id);
  if (!conv) return apiError(404, "Conversa não encontrada.");

  const after = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
  const [msgs, [person]] = await Promise.all([
    listMessages(db, id, after),
    db.select().from(users).where(eq(users.id, conv.userId)).limit(1),
  ]);

  // O analista vê os chamados do funcionário desta conversa (e só deste).
  let userTickets: ReturnType<typeof toTicketView>[] = [];
  let ticketsError: string | null = null;
  try {
    const now = Date.now();
    userTickets = (await tickets.list(conv.userId)).map((t) => toTicketView(t, now));
  } catch {
    ticketsError = "Sistema de chamados indisponível no momento.";
  }

  const handoff =
    conv.handoffAt && conv.handoffReason
      ? handoffInfo(conv.handoffReason as HandoffReason, conv.handoffAt)
      : null;

  return json({
    conversation: {
      id: conv.id,
      state: conv.state,
      analystId: conv.analystId,
      handoffReason: conv.handoffReason,
      handoffSummary: conv.handoffSummary,
      handoffAt: conv.handoffAt,
      handoffLevel: handoff?.level ?? null,
      handoffDeadline: handoff?.deadline ?? null,
      confidence: conv.confidence,
    },
    user: person
      ? { id: person.id, name: person.name, department: person.department, email: person.email }
      : null,
    messages: msgs,
    tickets: userTickets,
    ticketsError,
  });
}
