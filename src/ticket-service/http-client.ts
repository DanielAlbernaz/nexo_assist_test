import type { Ticket } from "@/domain/types";
import { withRetry, type RetryOptions, type TicketClient } from "./client";
import {
  ReopenNotAllowedError,
  TicketNotFoundError,
  TicketServiceUnavailableError,
} from "./errors";
import type { TicketErrorCode, TicketOp } from "./http";

/** Envia `POST <op>` com JSON e devolve a resposta HTTP crua. */
export type TicketTransport = (op: TicketOp, payload: object) => Promise<Response>;

/** Transporte de rede: `baseUrl` aponta para o sistema de chamados (`.../api/ticket-service`). */
export function fetchTransport(
  baseUrl: string,
  token: string,
  { timeoutMs = 10_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): TicketTransport {
  return (op, payload) =>
    fetchImpl(`${baseUrl.replace(/\/$/, "")}/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
}

async function call<T>(
  transport: TicketTransport,
  op: TicketOp,
  payload: { id?: string; [key: string]: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await transport(op, payload);
  } catch {
    // Rede fora, DNS, timeout: o sistema está inalcançável.
    throw new TicketServiceUnavailableError();
  }
  if (res.ok) return (await res.json()) as T;

  const { error } = (await res.json().catch(() => ({}))) as { error?: TicketErrorCode };
  const id = payload.id ?? "";
  if (error === "not_found") throw new TicketNotFoundError(id);
  if (error === "reopen_not_allowed") throw new ReopenNotAllowedError(id);
  if (error === "invalid_request" || error === "unauthorized") {
    // Bug nosso (contrato ou configuração), não é para repetir nem esconder.
    throw new Error(`Sistema de chamados recusou a requisição (${res.status}: ${error}).`);
  }
  throw new TicketServiceUnavailableError(); // 503, 5xx e respostas inesperadas
}

/**
 * Cliente do sistema de chamados por HTTP: a mesma interface do cliente em
 * processo (`createTicketClient`), com retry para indisponibilidade.
 */
export function createHttpTicketClient(
  transport: TicketTransport,
  retry?: RetryOptions,
): TicketClient {
  return {
    list: (requesterId) =>
      withRetry(() => call<Ticket[]>(transport, "list", { requesterId }), retry),
    get: (id, requesterId) =>
      withRetry(() => call<Ticket>(transport, "get", { id, requesterId }), retry),
    create: (requesterId, input) =>
      withRetry(() => call<Ticket>(transport, "create", { requesterId, input }), retry),
    addUpdate: (id, requesterId, note, author) =>
      withRetry(
        () => call<Ticket>(transport, "addUpdate", { id, requesterId, note, author }),
        retry,
      ),
    reopen: (id, requesterId, reason) =>
      withRetry(() => call<Ticket>(transport, "reopen", { id, requesterId, reason }), retry),
  };
}
