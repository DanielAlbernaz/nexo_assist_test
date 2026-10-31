export class TicketServiceUnavailableError extends Error {
  readonly retryable = true;
  constructor() {
    super("O sistema de chamados está indisponível no momento.");
    this.name = "TicketServiceUnavailableError";
  }
}

/** Também usado quando o chamado pertence a outro funcionário (não vaza existência). */
export class TicketNotFoundError extends Error {
  readonly retryable = false;
  constructor(id: string) {
    super(`Chamado ${id} não encontrado para este funcionário.`);
    this.name = "TicketNotFoundError";
  }
}

export class ReopenNotAllowedError extends Error {
  readonly retryable = false;
  constructor(id: string) {
    super(
      `O chamado ${id} não pode ser reaberto: só chamados resolvidos há até 7 dias.`,
    );
    this.name = "ReopenNotAllowedError";
  }
}
