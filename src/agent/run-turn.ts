import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { ModelMessage } from "ai";
import type { Db } from "@/db/client";
import { addMessage } from "@/chat/repository";
import type { AgentStep, Block, ChatMessage, DraftView, MessageParts, TicketView } from "@/chat/types";
import { config } from "@/lib/config";
import type { TicketClient } from "@/ticket-service/client";
import { buildInstructions } from "./instructions";
import { getModels } from "./model";
import { createTools, STEP_LABELS } from "./tools";

/** Campos que usamos dos chunks do Mastra (text-delta, tool-call, tool-result, tool-error). */
interface StreamPayload {
  text?: string;
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
  error?: unknown;
}

export type TurnEvent =
  | { type: "step"; step: AgentStep }
  | { type: "text"; delta: string }
  | { type: "block"; block: Block }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; message: string };

export interface TurnParams {
  db: Db;
  tickets: TicketClient;
  user: { id: string; name: string; department: string };
  conversationId: string;
  /** Mensagens anteriores (já inclui a mais recente do funcionário). */
  history: ChatMessage[];
  now?: () => number;
  /** Para testes: substitui a criação do agent. */
  agentFactory?: (tools: ReturnType<typeof createTools>) => Pick<Agent, "stream">;
}

/** Traduz mensagens salvas no formato do modelo, resumindo cards em texto. */
export function toModelMessages(history: ChatMessage[], window: number = config.historyWindow) {
  const out: ModelMessage[] = [];
  for (const m of history.slice(-window)) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    const notes = (m.parts?.blocks ?? []).map((b) => {
      switch (b.kind) {
        case "draft":
          return `[rascunho ${b.draft.id} (${b.draft.action}: ${b.draft.title}, prioridade ${b.draft.priority}) mostrado, status ${b.draft.status}]`;
        case "ticket-card":
          return `[card do chamado ${b.ticket.id} mostrado]`;
        case "ticket-choice":
          return `[lista de chamados mostrada: ${b.tickets.map((t) => t.id).join(", ")}]`;
        case "ticket-result":
          return `[chamado ${b.ticket.id} ${b.action === "create" ? "criado" : b.action === "update" ? "atualizado" : "reaberto"}]`;
        case "choices":
          return `[opções mostradas: ${b.options.join(" | ")}]`;
        default:
          return "";
      }
    });
    const prefix = m.role === "analyst" ? "(analista humano) " : "";
    out.push({
      role: "assistant",
      content: [prefix + m.content, ...notes].filter(Boolean).join("\n"),
    });
  }
  return out;
}

/** Saídas das ferramentas que viram cards (ver tools.ts). */
interface ToolOutput {
  error?: string;
  ticket?: TicketView;
  tickets?: TicketView[];
  draft?: DraftView;
  options?: string[];
  level?: string;
}

function blockFromResult(tool: string, result: unknown): Block | null {
  const r = result as ToolOutput | undefined;
  if (!r || r.error) return null;
  switch (tool) {
    case "get_ticket":
      return r.ticket ? { kind: "ticket-card", ticket: r.ticket } : null;
    case "present_tickets":
      return r.tickets?.length ? { kind: "ticket-choice", tickets: r.tickets } : null;
    case "draft_ticket":
      return r.draft ? { kind: "draft", draft: r.draft } : null;
    case "offer_choices":
      return r.options ? { kind: "choices", options: r.options } : null;
    default:
      return null;
  }
}

function stepLabel(tool: string, input: unknown, result: unknown): string {
  const args = input as { ticketId?: string } | null | undefined;
  const output = result as ToolOutput | undefined;
  const base = STEP_LABELS[tool] ?? tool;
  if (tool === "get_ticket" && args?.ticketId) return `${base} ${String(args.ticketId).toUpperCase()}`;
  if (tool === "draft_ticket" && output?.draft) {
    return `classificou a prioridade (${output.draft.priority}) · consultou o prazo · ${base}`;
  }
  if (tool === "request_handoff" && output?.level) return `${base} (Suporte ${output.level})`;
  return base;
}

/**
 * Executa um turno do agent: transmite passos, texto e cards conforme chegam e,
 * ao final, grava a resposta no banco. Quem chama decide o que fazer com os eventos.
 */
export async function* runAgentTurn(params: TurnParams): AsyncGenerator<TurnEvent> {
  const { db, tickets, user, conversationId, history } = params;
  const now = params.now ?? Date.now;
  const tools = createTools({ db, tickets, now });
  const agent =
    params.agentFactory?.(tools) ??
    new Agent({
      id: "nexo-assist",
      name: "Nexo Assist",
      instructions: buildInstructions(user),
      model: getModels(),
      tools,
    });

  const requestContext = new RequestContext();
  requestContext.set("userId", user.id);
  requestContext.set("conversationId", conversationId);

  const steps: AgentStep[] = [];
  const blocks: Block[] = [];
  const startedAt = new Map<string, number>();
  let text = "";

  try {
    const output = await agent.stream(toModelMessages(history), {
      requestContext,
      maxSteps: 8,
      // Evita turno pendurado se o provedor travar (o modelo tem retry e fallback).
      abortSignal: AbortSignal.timeout(60_000),
    });
    for await (const chunk of output.fullStream) {
      const c = chunk as { type: string; payload: StreamPayload };
      if (c.type === "text-delta") {
        const delta = c.payload.text ?? "";
        text += delta;
        yield { type: "text", delta };
      } else if (c.type === "tool-call") {
        startedAt.set(c.payload.toolCallId, Date.now());
      } else if (c.type === "tool-result" || c.type === "tool-error") {
        const p = c.payload;
        const failed = c.type === "tool-error" || p.isError === true;
        const result = failed ? { error: String(p.error ?? p.result ?? "erro") } : p.result;
        const step: AgentStep = {
          id: p.toolCallId,
          tool: p.toolName,
          label: stepLabel(p.toolName, p.args, result),
          input: p.args ?? null,
          output: result,
          ok: !failed && !(result as ToolOutput | undefined)?.error,
          ms: Date.now() - (startedAt.get(p.toolCallId) ?? Date.now()),
        };
        steps.push(step);
        yield { type: "step", step };
        const block = failed ? null : blockFromResult(p.toolName, result);
        if (block) {
          blocks.push(block);
          yield { type: "block", block };
        }
      } else if (c.type === "error") {
        throw c.payload?.error ?? new Error("Erro do modelo");
      }
    }
  } catch (err) {
    console.error("[agent] falha no turno", err);
    const message =
      "Tive um problema para processar sua mensagem agora. Tente novamente em instantes ou peça para falar com um analista.";
    const saved = await addMessage(db, { conversationId, role: "agent", content: message, now: now() });
    yield { type: "error", message };
    yield { type: "done", message: saved };
    return;
  }

  const parts: MessageParts | null = steps.length || blocks.length ? { steps, blocks } : null;
  const saved = await addMessage(db, {
    conversationId,
    role: "agent",
    content: text.trim() || "Certo.",
    parts,
    now: now(),
  });
  yield { type: "done", message: saved };
}
