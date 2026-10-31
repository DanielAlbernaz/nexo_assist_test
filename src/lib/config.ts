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
    /** Base HTTP do sistema de chamados; vazio = chamada em processo (mesmo contrato). */
    url: process.env.TICKET_SERVICE_URL ?? "",
    token: process.env.TICKET_SERVICE_TOKEN ?? "",
    failureRate: num(process.env.TICKET_SERVICE_FAILURE_RATE, 0),
    latencyMs: num(process.env.TICKET_SERVICE_LATENCY_MS, 0),
  },
  llm: {
    provider: process.env.LLM_PROVIDER ?? "google",
    model: process.env.LLM_MODEL ?? "gemini-flash-lite-latest",
    /** Opcional. Só ajuda se esse modelo tiver cota (o plano gratuito limita os flash maiores). */
    fallbackModel: process.env.LLM_FALLBACK_MODEL ?? "",
  },
} as const;

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada (veja .env.example).`);
  }
  return value;
}
