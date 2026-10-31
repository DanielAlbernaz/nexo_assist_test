const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) ? n : fallback;
};

export const config = {
  /** Mensagens do funcionário por conversa ("sessão"), para limitar custo. */
  maxMessagesPerSession: num(process.env.MAX_MESSAGES_PER_SESSION, 30),
  /** Mensagens por minuto por usuário (proteção contra abuso). */
  maxMessagesPerMinute: 8,
  /** Quantas mensagens anteriores o agent recebe a cada turno. */
  historyWindow: 16,
  ticketService: {
    failureRate: num(process.env.TICKET_SERVICE_FAILURE_RATE, 0),
    latencyMs: num(process.env.TICKET_SERVICE_LATENCY_MS, 0),
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? "google",
    model: process.env.LLM_MODEL ?? "gemini-flash-lite-latest",
  },
} as const;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada (veja .env.example).`);
  }
  return value;
}
