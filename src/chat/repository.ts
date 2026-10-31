import { and, asc, count, desc, eq, gt, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, drafts, messages } from "@/db/schema";
import type { ChatMessage, ConversationState, MessageParts } from "./types";

export type Conversation = typeof conversations.$inferSelect;

export async function getOrCreateConversation(
  db: Db,
  userId: string,
  now = Date.now(),
): Promise<Conversation> {
  const [open] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, userId), ne(conversations.state, "closed")))
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  if (open) return open;
  const row = {
    id: crypto.randomUUID(),
    userId,
    state: "agent" as const,
    analystId: null,
    handoffSummary: null,
    handoffReason: null,
    handoffAt: null,
    confidence: null,
    userMessageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(conversations).values(row);
  return row;
}

export async function getLatestConversation(db: Db, userId: string): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  return row ?? null;
}

export async function draftStatuses(db: Db, conversationId: string) {
  const rows = await db
    .select({ id: drafts.id, status: drafts.status })
    .from(drafts)
    .where(eq(drafts.conversationId, conversationId));
  return Object.fromEntries(rows.map((r) => [r.id, r.status])) as Record<
    string,
    "pending" | "confirmed" | "cancelled"
  >;
}

/**
 * Mensagens do funcionário (em qualquer conversa) desde `since`. É a base do limite
 * por minuto: vem do banco, então vale em qualquer instância do servidor.
 */
export async function countRecentUserMessages(
  db: Db,
  userId: string,
  since: number,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.userId, userId),
        eq(messages.role, "user"),
        gt(messages.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

export async function getConversation(db: Db, id: string): Promise<Conversation | null> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return row ?? null;
}

export async function addMessage(
  db: Db,
  input: {
    conversationId: string;
    role: ChatMessage["role"];
    content: string;
    parts?: MessageParts | null;
    now?: number;
  },
): Promise<ChatMessage> {
  const now = input.now ?? Date.now();
  const row = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    parts: input.parts ? JSON.stringify(input.parts) : null,
    createdAt: now,
  };
  await db.insert(messages).values(row);
  await db
    .update(conversations)
    .set({ updatedAt: now })
    .where(eq(conversations.id, input.conversationId));
  return { ...row, parts: input.parts ?? null };
}

export async function listMessages(
  db: Db,
  conversationId: string,
  afterTs = 0,
): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), gt(messages.createdAt, afterTs)))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  return rows.map((r) => ({
    ...r,
    parts: r.parts ? (JSON.parse(r.parts) as MessageParts) : null,
  }));
}

export async function setState(
  db: Db,
  conversationId: string,
  state: ConversationState,
  extra: Partial<typeof conversations.$inferInsert> = {},
  now = Date.now(),
): Promise<void> {
  await db
    .update(conversations)
    .set({ state, updatedAt: now, ...extra })
    .where(eq(conversations.id, conversationId));
}

export async function incrementUserMessages(db: Db, conv: Conversation): Promise<number> {
  const next = conv.userMessageCount + 1;
  await db
    .update(conversations)
    .set({ userMessageCount: next })
    .where(eq(conversations.id, conv.id));
  return next;
}

export async function pendingDraft(db: Db, conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.conversationId, conversationId),
        eq(drafts.userId, userId),
        eq(drafts.status, "pending"),
      ),
    )
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  return row ?? null;
}
