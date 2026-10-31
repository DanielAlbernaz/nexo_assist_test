import { RequestContext } from "@mastra/core/request-context";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTools } from "@/agent/tools";
import { toModelMessages } from "@/agent/run-turn";
import type { Db } from "@/db/client";
import { articles, conversations, drafts, messages, tickets } from "@/db/schema";
import { createTicketClient } from "@/ticket-service/client";
import { TicketService } from "@/ticket-service/service";
import { createTestDb } from "@/ticket-service/test-db";
import { cancelDraft, confirmDraft, createDraft, type DraftInput } from "./drafts";
import { handoffInfo } from "./handoff";
import { draftIntent } from "./intent";
import { searchArticles } from "./knowledge";
import { getOrCreateConversation, listMessages } from "./repository";
import type { ChatMessage } from "./types";

const DAY = 24 * 60 * 60 * 1000;
// Terça-feira, 27/10/2026, 11:00 em Brasília.
const NOW = Date.UTC(2026, 9, 27, 14, 0);

let db: Db;
let client: ReturnType<typeof createTicketClient>;
let convId: string;

const noSleep = { sleep: async () => {} };

function ticketRow(over: Partial<typeof tickets.$inferInsert>): typeof tickets.$inferInsert {
  return {
    id: "INC-20001",
    type: "INC",
    title: "Impressora sem conexão",
    description: "A impressora do andar não aparece na lista.",
    category: "Hardware",
    priority: "Média",
    status: "Aberto",
    affected: "self",
    requesterId: "ana",
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    resolvedAt: null,
    ...over,
  };
}

const createInput: DraftInput = {
  action: "create",
  type: "INC",
  title: "VPN não conecta no notebook",
  description: "Erro 809 ao conectar na VPN desde ontem, notebook com Windows 11.",
  category: "Rede e VPN",
  affected: "self",
  blocking: true,
  sameDayCommitment: true,
};

beforeEach(async () => {
  db = await createTestDb();
  client = createTicketClient(new TicketService(db, { now: () => NOW }), noSleep);
  convId = (await getOrCreateConversation(db, "ana", NOW)).id;
});

const ctx = (userId = "ana") => ({ userId, conversationId: convId, now: NOW });

describe("rascunho de chamado", () => {
  it("calcula a prioridade no código, não pelo modelo", async () => {
    const r = await createDraft(db, client, ctx(), createInput);
    if (!("draft" in r)) throw new Error(r.error);
    expect(r.draft.priority).toBe("Alta");
    expect(r.draft.status).toBe("pending");
    // Prazo de 4 horas úteis a partir de terça 11h = terça 15h (Brasília).
    expect(r.draft.deadline).toBe(Date.UTC(2026, 9, 27, 18, 0));
  });

  it("pede mais informação quando faltam campos ou 'quem é afetado'", async () => {
    const missing = await createDraft(db, client, ctx(), { action: "create", title: "Algo quebrou" });
    expect(missing).toHaveProperty("error");
    const unknown = await createDraft(db, client, ctx(), { ...createInput, affected: "unknown" });
    expect(unknown).toHaveProperty("error");
    expect(await db.select().from(drafts)).toHaveLength(0);
  });

  it("não cria nada no sistema de chamados antes da confirmação", async () => {
    await createDraft(db, client, ctx(), createInput);
    expect(await db.select().from(tickets)).toHaveLength(0);
  });

  it("um novo rascunho substitui o pendente anterior", async () => {
    await createDraft(db, client, ctx(), createInput);
    await createDraft(db, client, ctx(), { ...createInput, title: "VPN com timeout em casa" });
    const rows = await db.select().from(drafts);
    expect(rows.filter((d) => d.status === "pending")).toHaveLength(1);
    expect(rows.filter((d) => d.status === "cancelled")).toHaveLength(1);
  });

  it("não deixa atualizar ou reabrir chamado de outro funcionário", async () => {
    await db.insert(tickets).values(ticketRow({ id: "INC-20002", requesterId: "carla" }));
    const r = await createDraft(db, client, ctx("ana"), {
      action: "update",
      targetTicketId: "INC-20002",
      note: "ainda acontece",
    });
    expect(r).toEqual({ error: expect.stringContaining("não encontrado") });
  });

  it("recusa reabrir chamado resolvido há mais de 7 dias", async () => {
    await db
      .insert(tickets)
      .values(ticketRow({ status: "Resolvido", resolvedAt: NOW - 9 * DAY }));
    const r = await createDraft(db, client, ctx(), {
      action: "reopen",
      targetTicketId: "INC-20001",
      note: "voltou",
    });
    expect(r).toEqual({ error: expect.stringContaining("7 dias") });
  });

  it("permite reabrir chamado resolvido recentemente", async () => {
    await db
      .insert(tickets)
      .values(ticketRow({ status: "Resolvido", resolvedAt: NOW - 2 * DAY }));
    const r = await createDraft(db, client, ctx(), {
      action: "reopen",
      targetTicketId: "INC-20001",
      note: "voltou a falhar",
    });
    expect(r).toHaveProperty("draft");
  });
});

describe("confirmação", () => {
  async function pendingDraftId(input: DraftInput = createInput) {
    const r = await createDraft(db, client, ctx(), input);
    if (!("draft" in r)) throw new Error(r.error);
    return r.draft.id;
  }

  it("só o funcionário dono confirma, e cria o chamado", async () => {
    const id = await pendingDraftId();
    expect(await confirmDraft(db, client, id, "carla", NOW)).toEqual({ ok: false, error: "not_found" });
    expect(await db.select().from(tickets)).toHaveLength(0);

    const result = await confirmDraft(db, client, id, "ana", NOW);
    expect(result).toMatchObject({ ok: true, action: "create", handedOff: false });
    const [created] = await db.select().from(tickets);
    expect(created).toMatchObject({ requesterId: "ana", priority: "Alta", status: "Aberto" });
    const msgs = await listMessages(db, convId);
    expect(msgs.at(-1)?.parts?.blocks?.[0]).toMatchObject({ kind: "ticket-result" });
  });

  it("não confirma duas vezes (sem chamado duplicado)", async () => {
    const id = await pendingDraftId();
    await confirmDraft(db, client, id, "ana", NOW);
    expect(await confirmDraft(db, client, id, "ana", NOW)).toEqual({ ok: false, error: "already_resolved" });
    expect(await db.select().from(tickets)).toHaveLength(1);
  });

  it("atualiza o chamado existente e zera o prazo", async () => {
    await db.insert(tickets).values(ticketRow({ updatedAt: NOW - 5 * DAY }));
    const r = await createDraft(db, client, ctx(), {
      action: "update",
      targetTicketId: "INC-20001",
      note: "agora também falha no Wi-Fi",
    });
    if (!("draft" in r)) throw new Error(r.error);
    await confirmDraft(db, client, r.draft.id, "ana", NOW);
    const [row] = await db.select().from(tickets).where(eq(tickets.id, "INC-20001"));
    expect(row?.updatedAt).toBe(NOW);
    expect(await db.select().from(tickets)).toHaveLength(1);
  });

  it("chamado crítico transfere a conversa para um analista", async () => {
    const id = await pendingDraftId({
      ...createInput,
      affected: "company",
      title: "Sistema de vendas fora do ar",
      description: "Ninguém consegue emitir pedidos desde as 10h, toda a operação parada.",
      category: "Software",
    });
    const result = await confirmDraft(db, client, id, "ana", NOW);
    expect(result).toMatchObject({ ok: true, handedOff: true });
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
    expect(conv).toMatchObject({ state: "waiting_analyst", handoffReason: "critical" });
  });

  it("se o sistema de chamados estiver fora, o rascunho continua pendente", async () => {
    const id = await pendingDraftId();
    const down = createTicketClient(new TicketService(db, { failureRate: 1 }), noSleep);
    await expect(confirmDraft(db, down, id, "ana", NOW)).rejects.toThrow(/indispon/);
    const [row] = await db.select().from(drafts).where(eq(drafts.id, id));
    expect(row?.status).toBe("pending");
    // Quando volta, o mesmo rascunho pode ser confirmado.
    expect(await confirmDraft(db, client, id, "ana", NOW)).toMatchObject({ ok: true });
  });

  it("cancelar não cria nada e registra a resposta", async () => {
    const id = await pendingDraftId();
    expect(await cancelDraft(db, id, "ana", NOW)).toBe(true);
    expect(await db.select().from(tickets)).toHaveLength(0);
    const last = (await db.select().from(messages)).at(-1);
    expect(last?.content).toMatch(/cancelei/i);
  });
});

describe("ferramentas do agent: privacidade e uso", () => {
  const withContext = (userId: string) => {
    const requestContext = new RequestContext();
    requestContext.set("userId", userId);
    requestContext.set("conversationId", convId);
    return { requestContext };
  };
  const tools = () => createTools({ db, tickets: client, now: () => NOW });
  // As ferramentas do Mastra têm `execute` opcional na tipagem; aqui sempre existe.
  const run = <T,>(tool: unknown, input: unknown, userId: string): Promise<T> =>
    (tool as { execute: (i: unknown, c: unknown) => Promise<T> }).execute(input, withContext(userId));

  beforeEach(async () => {
    await db.insert(tickets).values([
      ticketRow({ id: "INC-20001", requesterId: "ana" }),
      ticketRow({ id: "INC-20002", requesterId: "carla", title: "Segredo da Carla" }),
    ]);
  });

  it("list_my_tickets só devolve chamados do usuário da sessão", async () => {
    const out = await run<{ tickets: { id: string }[] }>(tools().list_my_tickets, {}, "ana");
    expect(out.tickets.map((t) => t.id)).toEqual(["INC-20001"]);
  });

  it("get_ticket de outro funcionário responde como não encontrado", async () => {
    const out = await run<{ error: string }>(tools().get_ticket, { ticketId: "INC-20002" }, "ana");
    expect(out.error).toMatch(/não encontrado/);
    expect(JSON.stringify(out)).not.toContain("Segredo");
  });

  it("find_duplicates ignora chamados parecidos de outras pessoas", async () => {
    const out = await run<{ candidates: unknown[] }>(
      tools().find_duplicates,
      { title: "Segredo da Carla" },
      "ana",
    );
    expect(out.candidates).toHaveLength(0);
  });

  it("sistema de chamados indisponível vira erro legível para o agent", async () => {
    const down = createTicketClient(new TicketService(db, { failureRate: 1 }), noSleep);
    const out = await run<{ error: string }>(
      createTools({ db, tickets: down, now: () => NOW }).list_my_tickets,
      {},
      "ana",
    );
    expect(out.error).toMatch(/indisponível/);
  });

  it("request_handoff pausa o agent e devolve nível e prazo", async () => {
    const out = await run<{ level: string; eta: string }>(
      tools().request_handoff,
      { reason: "overdue", summary: "Chamado vencido há 6 dias" },
      "ana",
    );
    expect(out).toMatchObject({ level: "N2", eta: "2 horas úteis" });
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
    expect(conv?.state).toBe("waiting_analyst");
  });

  it("sem usuário no contexto a ferramenta falha em vez de assumir um", async () => {
    await expect(
      (tools().list_my_tickets as unknown as { execute: (i: unknown, c: unknown) => Promise<unknown> }).execute(
        {},
        { requestContext: new RequestContext() },
      ),
    ).rejects.toThrow(/sem usuário/);
  });
});

describe("atalhos de confirmação", () => {
  it("reconhece confirmar e cancelar, e ignora o resto", () => {
    expect(draftIntent("sim")).toBe("confirm");
    expect(draftIntent("Pode criar!")).toBe("confirm");
    expect(draftIntent("cancelar")).toBe("cancel");
    expect(draftIntent("não")).toBe("cancel");
    expect(draftIntent("sim, mas mude a prioridade")).toBeNull();
    expect(draftIntent("Quero alterar o rascunho D-1: título")).toBeNull();
  });
});

describe("central de ajuda", () => {
  it("encontra o artigo certo pelo erro e dá preferência ao título", async () => {
    await db.insert(articles).values([
      { id: "a", title: "VPN com erro 809", category: "Rede e VPN", body: "Reinstale o cliente de VPN." },
      { id: "b", title: "Horário do service desk", category: "Outros", body: "Segunda a sexta, 8h às 18h." },
    ]);
    const hits = await searchArticles(db, "minha vpn dá erro 809");
    expect(hits[0]?.id).toBe("a");
    expect(await searchArticles(db, "horário de atendimento")).toHaveLength(1);
    expect(await searchArticles(db, "impressora de cor")).toHaveLength(0);
  });
});

describe("transferência", () => {
  it("define nível e prazo por motivo", () => {
    expect(handoffInfo("critical", NOW)).toMatchObject({ level: "N2", etaLabel: "1 hora", deadline: NOW + 3_600_000 });
    expect(handoffInfo("overdue", NOW)).toMatchObject({ level: "N2", etaLabel: "2 horas úteis" });
    expect(handoffInfo("user_request", NOW)).toMatchObject({ level: "N1", etaLabel: "4 horas úteis" });
  });
});

describe("histórico enviado ao modelo", () => {
  const msg = (over: Partial<ChatMessage>): ChatMessage => ({
    id: "1",
    conversationId: "c",
    role: "user",
    content: "oi",
    parts: null,
    createdAt: NOW,
    ...over,
  });

  it("resume cards em texto, ignora mensagens de sistema e respeita a janela", () => {
    const out = toModelMessages(
      [
        msg({ id: "1", content: "primeira" }),
        msg({ id: "2", role: "system", content: "Transferida" }),
        msg({
          id: "3",
          role: "agent",
          content: "Veja o rascunho",
          parts: {
            blocks: [
              {
                kind: "choices",
                options: ["Só eu", "Minha equipe"],
              },
            ],
          },
        }),
        msg({ id: "4", role: "analyst", content: "Olá, sou o Rafael" }),
      ],
      3,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: "assistant" });
    expect(String((out[0] as { content: string }).content)).toContain("opções mostradas");
    expect(String((out[1] as { content: string }).content)).toContain("(analista humano)");
  });
});
