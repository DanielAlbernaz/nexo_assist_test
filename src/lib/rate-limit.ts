/**
 * Limite em memória por chave (janela deslizante). Suficiente para uma instância;
 * em produção com várias instâncias, usar um armazenamento compartilhado (Redis).
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterMs: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]!) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimit(): void {
  hits.clear();
}
