import { handoffInfo } from "@/chat/handoff";
import {
  draftStatuses,
  getLatestConversation,
  getOrCreateConversation,
  listMessages,
} from "@/chat/repository";
import type { HandoffReason } from "@/chat/types";
import { isResponse, json, requireApiUser } from "@/lib/api";
import { config } from "@/lib/config";
import { db } from "@/lib/services";

/**
 * Conversa atual do funcionário e mensagens novas (usado também para polling).
 * Uma conversa encerrada continua visível até o funcionário pedir uma nova (?new=1).
 */
export async function GET(request: Request) {
  const user = await requireApiUser("employee");
  if (isResponse(user)) return user;

  const params = new URL(request.url).searchParams;
  const after = Number(params.get("after") ?? 0) || 0;
  const wantNew = params.get("new") === "1";

  let conv = await getLatestConversation(db, user.id);
  if (!conv || (conv.state === "closed" && wantNew)) {
    conv = await getOrCreateConversation(db, user.id);
  }
  const effectiveAfter = params.get("conversation") === conv.id ? after : 0;
  const messages = await listMessages(db, conv.id, effectiveAfter);

  const handoff =
    conv.handoffAt && conv.handoffReason
      ? handoffInfo(conv.handoffReason as HandoffReason, conv.handoffAt)
      : null;

  return json({
    conversation: {
      id: conv.id,
      state: conv.state,
      messagesUsed: conv.userMessageCount,
      messagesMax: config.maxMessagesPerSession,
      handoffLevel: handoff?.level ?? null,
    },
    drafts: await draftStatuses(db, conv.id),
    messages,
  });
}
