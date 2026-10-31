import { TicketServiceUnavailableError } from "./errors";
import type { TicketService } from "./service";

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Chama o sistema legado com nova tentativa para indisponibilidades curtas
 * (backoff exponencial). Erros de negócio (não encontrado, reabertura negada)
 * não são repetidos. Se esgotar as tentativas, o erro sobe para o agent, que
 * avisa o funcionário em vez de inventar uma resposta.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 300, sleep = defaultSleep }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!(err instanceof TicketServiceUnavailableError)) throw err;
      if (i < attempts - 1) await sleep(baseDelayMs * 2 ** i);
    }
  }
  throw lastError;
}

/** Visão do serviço usada pelo agent: mesmos métodos, todos com retry. */
export function createTicketClient(service: TicketService, retry?: RetryOptions) {
  return {
    list: (requesterId: string) =>
      withRetry(() => service.listByRequester(requesterId), retry),
    get: (id: string, requesterId: string) =>
      withRetry(() => service.getForRequester(id, requesterId), retry),
    create: (...args: Parameters<TicketService["create"]>) =>
      withRetry(() => service.create(...args), retry),
    addUpdate: (...args: Parameters<TicketService["addUpdate"]>) =>
      withRetry(() => service.addUpdate(...args), retry),
    reopen: (...args: Parameters<TicketService["reopen"]>) =>
      withRetry(() => service.reopen(...args), retry),
  };
}
export type TicketClient = ReturnType<typeof createTicketClient>;
