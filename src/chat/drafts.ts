import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { drafts } from "@/db/schema";
import { computePriority } from "@/domain/priority";
import { canReopen } from "@/domain/reopen";
import { CATEGORIES, TICKET_TYPES } from "@/domain/types";
import type { TicketClient } from "@/ticket-service/client";
import { requestHandoff } from "./handoff";
import { addMessage } from "./repository";
import type { DraftAction, DraftPayload, DraftView } from "./types";
import { toDraftView, toTicketView } from "./views";

export const draftInputSchema = z.object({
  action: z.enum(["create", "update", "reopen"]),
  targetTicketId: z.string().optional(),
  type: z.enum(TICKET_TYPES).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  subcategory: z.string().optional(),
  affected: z.enum(["self", "team", "company", "unknown"]).optional(),
  blocking: z.boolean().optional(),
  sameDayCommitment: z.boolean().optional(),
  note: z.string().optional(),
});
export type DraftInput = z.infer<typeof draftInputSchema>;

export type DraftResult = { draft: DraftView } | { error: string };

/**
 * Monta o rascunho e o grava como pendente. Nada é criado ou alterado no sistema
 * de chamados aqui: isso só acontece em `confirmDraft`, depois do aceite do
 * funcionário. A prioridade vem de `computePriority`, não do modelo.
 */
export async function createDraft(
  db: Db,
  tickets: TicketClient,
  ctx: { userId: string; conversationId: string; now?: number },
  input: DraftInput,
): Promise<DraftResult> {
  const now = ctx.now ?? Date.now();
  let payload: DraftPayload;

  if (input.action === "create") {
    const missing = (
      [
        ["type", input.type],
        ["title", input.title],
        ["description", input.description],
        ["category", input.category],
        ["affected", input.affected],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0 || input.affected === "unknown") {
      return {
        error:
          "Faltam informações para o rascunho: " +
          [...missing, ...(input.affected === "unknown" ? ["affected (pergunte quem é afetado)"] : [])].join(", ") +
          ". Pergunte ao funcionário antes de montar o rascunho.",
      };
    }
    payload = {
      action: "create",
      targetTicketId: null,
      type: input.type!,
      title: input.title!.trim(),
      description: input.description!.trim(),
      category: input.category!,
      subcategory: input.subcategory ?? null,
      affected: input.affected!,
      priority: computePriority({
        type: input.type!,
        affected: input.affected!,
        blocking: input.blocking ?? false,
        sameDayCommitment: input.sameDayCommitment ?? false,
      }),
      note: null,
    };
  } else {
    if (!input.targetTicketId || !input.note?.trim()) {
      return { error: "Informe targetTicketId e note (informação nova ou motivo da reabertura)." };
    }
    // Só chamados do próprio funcionário: o serviço responde "não encontrado" para os demais.
    let target;
    try {
      target = await tickets.get(input.targetTicketId, ctx.userId);
    } catch (err) {
      if (err instanceof Error && err.name === "TicketNotFoundError") {
        return { error: `Chamado ${input.targetTicketId} não encontrado para este funcionário.` };
      }
      throw err;
    }
    if (input.action === "reopen" && !canReopen(target, now)) {
      return {
        error: `${target.id} não pode ser reaberto: só chamados resolvidos há até 7 dias. Ofereça abrir um novo chamado.`,
      };
    }
    if (input.action === "update" && target.status === "Resolvido") {
      return { error: `${target.id} está resolvido. Use action "reopen" se estiver dentro de 7 dias.` };
    }
    payload = {
      action: input.action,
      targetTicketId: target.id,
      type: target.type,
      title: target.title,
      description: target.description,
      category: target.category,
      subcategory: target.subcategory,
      affected: target.affected,
      priority: target.priority,
      note: input.note.trim(),
    };
  }

  // Só um rascunho pendente por conversa: o novo substitui o anterior.
  await db
    .update(drafts)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(drafts.conversationId, ctx.conversationId),
        eq(drafts.userId, ctx.userId),
        eq(drafts.status, "pending"),
      ),
    );
  const id = `D-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  await db.insert(drafts).values({
    id,
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    payload: JSON.stringify(payload),
    status: "pending",
    targetTicketId: payload.targetTicketId,
    createdAt: now,
  });
  return { draft: toDraftView(id, "pending", payload, now) };
}

async function loadPending(db: Db, draftId: string, userId: string) {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)))
    .orderBy(desc(drafts.createdAt))
    .limit(1);
  return row ?? null;
}

const ACTION_TEXT: Record<DraftAction, (id: string, sla: string, priority: string) => string> = {
  create: (id, sla, p) => `Pronto: abri o chamado ${id} com prioridade ${p.toLowerCase()}. Você recebe uma resposta em até ${sla}.`,
  update: (id, sla) => `Atualizei o chamado ${id}. O prazo de ${sla} conta a partir de agora.`,
  reopen: (id, sla) => `Reabri o chamado ${id}. O prazo de ${sla} conta a partir de agora.`,
};

export type ConfirmResult =
  | { ok: true; action: DraftAction; ticketId: string; handedOff: boolean }
  | { ok: false; error: "not_found" | "already_resolved" };

/** Executa o rascunho no sistema de chamados. Chamado só pela ação do funcionário. */
export async function confirmDraft(
  db: Db,
  tickets: TicketClient,
  draftId: string,
  userId: string,
  now = Date.now(),
): Promise<ConfirmResult> {
  const row = await loadPending(db, draftId, userId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "pending") return { ok: false, error: "already_resolved" };
  const p = JSON.parse(row.payload) as DraftPayload;

  // Se o sistema legado estiver fora, o erro sobe e o rascunho continua pendente.
  let ticket;
  if (p.action === "create") {
    ticket = await tickets.create(userId, {
      type: p.type,
      title: p.title,
      description: p.description,
      category: p.category,
      subcategory: p.subcategory,
      priority: p.priority,
      affected: p.affected,
    });
  } else if (p.action === "update") {
    ticket = await tickets.addUpdate(p.targetTicketId!, userId, p.note ?? "");
  } else {
    ticket = await tickets.reopen(p.targetTicketId!, userId, p.note ?? "");
  }

  await db.update(drafts).set({ status: "confirmed", targetTicketId: ticket.id }).where(eq(drafts.id, draftId));

  const view = toTicketView(ticket, now);
  const critical = p.action === "create" && ticket.priority === "Crítica";
  let text = ACTION_TEXT[p.action](ticket.id, view.slaLabel, ticket.priority);
  if (critical) {
    await requestHandoff(db, {
      conversationId: row.conversationId,
      reason: "critical",
      summary: `Chamado crítico ${ticket.id}: ${ticket.title}. ${ticket.description}`,
      now: now + 1,
    });
    text += " Como é crítico, já encaminhei a conversa para um analista.";
  }
  await addMessage(db, {
    conversationId: row.conversationId,
    role: "agent",
    content: text,
    parts: { blocks: [{ kind: "ticket-result", action: p.action, ticket: view }] },
    now,
  });
  return { ok: true, action: p.action, ticketId: ticket.id, handedOff: critical };
}

export async function cancelDraft(db: Db, draftId: string, userId: string, now = Date.now()) {
  const row = await loadPending(db, draftId, userId);
  if (!row || row.status !== "pending") return false;
  await db.update(drafts).set({ status: "cancelled" }).where(eq(drafts.id, draftId));
  await addMessage(db, {
    conversationId: row.conversationId,
    role: "agent",
    content: "Tudo bem, cancelei o rascunho. Nada foi criado.",
    now,
  });
  return true;
}
