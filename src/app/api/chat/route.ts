import { z } from "zod";
import { runAgentTurn, type TurnEvent } from "@/agent/run-turn";
import { cancelDraft, confirmDraft } from "@/chat/drafts";
import { draftIntent } from "@/chat/intent";
import {
  addMessage,
  countRecentUserMessages,
  getOrCreateConversation,
  incrementUserMessages,
  listMessages,
  pendingDraft,
} from "@/chat/repository";
import { apiError, isResponse, requireApiUser } from "@/lib/api";
import { config } from "@/lib/config";
import { db, tickets } from "@/lib/services";

export const maxDuration = 60;

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function POST(request: Request) {
  const user = await requireApiUser("employee");
  if (isResponse(user)) return user;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Escreva uma mensagem de até 2000 caracteres.");
  const { text } = parsed.data;

  const lastMinute = await countRecentUserMessages(db, user.id, Date.now() - 60_000);
  if (lastMinute >= config.maxMessagesPerMinute) {
    return apiError(429, "Você está enviando mensagens rápido demais. Aguarde alguns segundos.");
  }

  const conv = await getOrCreateConversation(db, user.id);
  if (conv.userMessageCount >= config.maxMessagesPerSession) {
    return apiError(
      429,
      `Você atingiu o limite de ${config.maxMessagesPerSession} mensagens desta conversa. Peça para falar com um analista ou ligue no ramal 4000.`,
      { limitReached: true },
    );
  }

  const userMessage = await addMessage(db, {
    conversationId: conv.id,
    role: "user",
    content: text,
  });
  const used = await incrementUserMessages(db, conv);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));
      send("user", { message: userMessage, messagesUsed: used });

      try {
        // Conversa com um analista: guardamos a mensagem, mas o agent não responde.
        if (conv.state !== "agent") {
          send("paused", { state: conv.state });
          return;
        }

        const draft = await pendingDraft(db, conv.id, user.id);
        const intent = draft ? draftIntent(text) : null;
        if (draft && intent) {
          if (intent === "confirm") await confirmDraft(db, tickets, draft.id, user.id);
          else await cancelDraft(db, draft.id, user.id);
          const fresh = await listMessages(db, conv.id, userMessage.createdAt);
          for (const m of fresh) send("message", { message: m });
          send("end", {});
          return;
        }

        const history = await listMessages(db, conv.id);
        for await (const ev of runAgentTurn({
          db,
          tickets,
          user,
          conversationId: conv.id,
          history,
        }) as AsyncGenerator<TurnEvent>) {
          send(ev.type, ev.type === "done" ? { message: ev.message } : ev);
        }
        send("end", {});
      } catch (err) {
        console.error("[chat] erro", err);
        send("error", {
          message:
            err instanceof Error && err.name === "TicketServiceUnavailableError"
              ? err.message
              : "Não consegui concluir agora. Tente novamente.",
        });
        send("end", {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
