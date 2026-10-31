import { desc, eq, inArray } from "drizzle-orm";
import { conversations, messages, users } from "@/db/schema";
import { handoffInfo } from "@/chat/handoff";
import type { HandoffReason } from "@/chat/types";
import { isResponse, json, requireApiUser } from "@/lib/api";
import { db } from "@/lib/services";

export async function GET() {
  const analyst = await requireApiUser("analyst");
  if (isResponse(analyst)) return analyst;

  const convs = await db.select().from(conversations).orderBy(desc(conversations.updatedAt)).limit(100);
  if (convs.length === 0) return json({ conversations: [] });

  const people = await db
    .select()
    .from(users)
    .where(inArray(users.id, [...new Set(convs.flatMap((c) => [c.userId, c.analystId ?? c.userId]))]));
  const byId = new Map(people.map((u) => [u.id, u]));

  const rows = await Promise.all(
    convs.map(async (c) => {
      const [last] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const person = byId.get(c.userId);
      const handoff =
        c.handoffAt && c.handoffReason
          ? handoffInfo(c.handoffReason as HandoffReason, c.handoffAt)
          : null;
      return {
        id: c.id,
        state: c.state,
        user: { id: c.userId, name: person?.name ?? c.userId, department: person?.department ?? "" },
        analystId: c.analystId,
        analystName: c.analystId ? byId.get(c.analystId)?.name ?? null : null,
        lastMessage: last ? { role: last.role, content: last.content, createdAt: last.createdAt } : null,
        updatedAt: c.updatedAt,
        handoffReason: c.handoffReason,
        confidence: c.confidence,
        handoffDeadline: handoff?.deadline ?? null,
        handoffLevel: handoff?.level ?? null,
      };
    }),
  );
  return json({ conversations: rows, me: { id: analyst.id } });
}
