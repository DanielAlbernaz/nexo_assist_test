import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Db } from "@/db/client";
import { createDraft, draftInputSchema } from "@/chat/drafts";
import { requestHandoff } from "@/chat/handoff";
import { searchArticles } from "@/chat/knowledge";
import { toTicketView } from "@/chat/views";
import { findDuplicateCandidates } from "@/domain/duplicates";
import { CATEGORIES } from "@/domain/types";
import type { TicketClient } from "@/ticket-service/client";

export interface ToolDeps {
  db: Db;
  tickets: TicketClient;
  now?: () => number;
}

/** Rótulos curtos mostrados acima da resposta (painel de transparência). */
export const STEP_LABELS: Record<string, string> = {
  search_help_center: "buscou na central de ajuda",
  list_my_tickets: "consultou seus chamados",
  get_ticket: "consultou o chamado",
  present_tickets: "listou seus chamados",
  find_duplicates: "verificou chamados parecidos",
  draft_ticket: "montou o rascunho",
  offer_choices: "preparou opções",
  request_handoff: "encaminhou para um analista",
};

/**
 * O funcionário e a conversa vêm do `requestContext`, definido pelo servidor a
 * partir da sessão. O modelo nunca informa quem é o usuário: por isso ele não
 * consegue consultar chamados de outra pessoa, mesmo que seja induzido a tentar.
 */
function identity(context: { requestContext?: { get: (key: string) => unknown } }) {
  const userId = context.requestContext?.get("userId");
  const conversationId = context.requestContext?.get("conversationId");
  if (typeof userId !== "string" || typeof conversationId !== "string") {
    throw new Error("Contexto da requisição sem usuário ou conversa.");
  }
  return { userId, conversationId };
}

async function guarded<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TicketServiceUnavailableError") {
      return {
        error:
          "O sistema de chamados está indisponível agora, mesmo após novas tentativas. Avise o funcionário, não invente dados e ofereça tentar de novo em instantes ou chamar um analista.",
      };
    }
    if (name === "TicketNotFoundError" || name === "ReopenNotAllowedError") {
      return { error: (err as Error).message };
    }
    throw err;
  }
}

export function createTools({ db, tickets, now = Date.now }: ToolDeps) {
  const search_help_center = createTool({
    id: "search_help_center",
    description:
      "Busca artigos na central de ajuda de TI. Use primeiro para dúvidas e problemas comuns. Retorna até 3 artigos com instruções.",
    inputSchema: z.object({ query: z.string().describe("Palavras-chave do problema") }),
    execute: async ({ query }) => ({ articles: await searchArticles(db, query) }),
  });

  const list_my_tickets = createTool({
    id: "list_my_tickets",
    description:
      "Lista todos os chamados do funcionário atual (abertos e resolvidos), com prazo e se estão vencidos. Use para checar duplicidade e para responder sobre status.",
    inputSchema: z.object({}),
    execute: async (_input, context) => {
      const { userId } = identity(context);
      return guarded(async () => ({
        tickets: (await tickets.list(userId)).map((t) => toTicketView(t, now())),
      }));
    },
  });

  const get_ticket = createTool({
    id: "get_ticket",
    description:
      "Consulta um chamado do funcionário atual pelo número (ex.: INC-20311). Mostra o card do chamado ao funcionário. Só funciona para chamados dele.",
    inputSchema: z.object({ ticketId: z.string() }),
    execute: async ({ ticketId }, context) => {
      const { userId } = identity(context);
      return guarded(async () => ({
        ticket: toTicketView(await tickets.get(ticketId.toUpperCase(), userId), now()),
      }));
    },
  });

  const present_tickets = createTool({
    id: "present_tickets",
    description:
      "Mostra ao funcionário uma lista de chamados dele para escolher um. Use quando ele pergunta de 'meu chamado' sem dizer qual e há mais de um.",
    inputSchema: z.object({ ticketIds: z.array(z.string()).min(1).max(8) }),
    execute: async ({ ticketIds }, context) => {
      const { userId } = identity(context);
      return guarded(async () => {
        const all = await tickets.list(userId);
        const wanted = new Set(ticketIds.map((i) => i.toUpperCase()));
        return {
          tickets: all.filter((t) => wanted.has(t.id)).map((t) => toTicketView(t, now())),
        };
      });
    },
  });

  const find_duplicates = createTool({
    id: "find_duplicates",
    description:
      "Procura, entre os chamados do funcionário, algum aberto (ou resolvido há até 7 dias) sobre o mesmo problema. Chame antes de montar um rascunho de novo chamado. Se achar, o correto é atualizar ou reabrir, não duplicar.",
    inputSchema: z.object({
      title: z.string(),
      description: z.string().optional(),
      category: z.enum(CATEGORIES).optional(),
    }),
    execute: async (input, context) => {
      const { userId } = identity(context);
      return guarded(async () => {
        const mine = await tickets.list(userId);
        const found = findDuplicateCandidates(mine, input, now());
        return {
          candidates: found.map((c) => ({
            ticket: toTicketView(c.ticket, now()),
            action: c.action,
            similarity: Number(c.score.toFixed(2)),
          })),
        };
      });
    },
  });

  const draft_ticket = createTool({
    id: "draft_ticket",
    description:
      "Monta o RASCUNHO de um chamado novo (create), de uma atualização (update) ou de uma reabertura (reopen) e o mostra ao funcionário para confirmar. NÃO cria nem altera nada: só o botão Confirmar do funcionário faz isso. A prioridade e o prazo são calculados pelo sistema a partir de affected, blocking e sameDayCommitment. Só chame com todas as informações; se faltar algo (principalmente quem é afetado), pergunte antes.",
    inputSchema: draftInputSchema.extend({
      affected: z
        .enum(["self", "team", "company", "unknown"])
        .optional()
        .describe("Quantas pessoas são afetadas: só o funcionário, a equipe ou a empresa"),
      blocking: z.boolean().optional().describe("O problema impede alguém de trabalhar?"),
      sameDayCommitment: z
        .boolean()
        .optional()
        .describe("Há um compromisso hoje em risco (reunião, entrega)?"),
    }),
    execute: async (input, context) => {
      const { userId, conversationId } = identity(context);
      return guarded(() => createDraft(db, tickets, { userId, conversationId, now: now() }, input));
    },
  });

  const offer_choices = createTool({
    id: "offer_choices",
    description:
      "Mostra botões de resposta rápida ao funcionário (2 a 4 opções curtas) para uma pergunta de múltipla escolha, como 'Quem é afetado?'. Faça a pergunta no texto e termine a vez.",
    inputSchema: z.object({ options: z.array(z.string().max(40)).min(2).max(4) }),
    execute: async ({ options }) => ({ options }),
  });

  const request_handoff = createTool({
    id: "request_handoff",
    description:
      "Transfere a conversa para um analista humano; depois disso você para de responder. Use quando o funcionário pedir, em caso crítico, quando o chamado em discussão estiver vencido e ele aceitar, ou quando você não tiver segurança sobre o que fazer (informe a confiança de 0 a 1).",
    inputSchema: z.object({
      reason: z.enum(["user_request", "critical", "overdue", "low_confidence"]),
      summary: z
        .string()
        .describe("Resumo do caso para o analista: problema, o que já foi tentado, chamados relacionados"),
      confidence: z.number().min(0).max(1).optional(),
    }),
    execute: async (input, context) => {
      const { conversationId } = identity(context);
      const info = await requestHandoff(db, { conversationId, now: now(), ...input });
      return { level: info.level, eta: info.etaLabel, deadline: info.deadline };
    },
  });

  return {
    search_help_center,
    list_my_tickets,
    get_ticket,
    present_tickets,
    find_duplicates,
    draft_ticket,
    offer_choices,
    request_handoff,
  };
}

export type AgentTools = ReturnType<typeof createTools>;
