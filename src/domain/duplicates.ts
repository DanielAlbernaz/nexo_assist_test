import { canReopen } from "./reopen";
import type { Category, Ticket } from "./types";

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na",
  "nos", "nas", "um", "uma", "para", "por", "com", "que", "meu", "minha",
  "nao", "não", "esta", "está", "ao", "se", "ou",
]);

function tokens(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
  return new Set(
    normalized.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export interface DuplicateCandidate {
  ticket: Ticket;
  score: number;
  /** Aberto (atualizar) ou resolvido há ≤ 7 dias (reabrir). */
  action: "update" | "reopen";
}

/**
 * Candidatos a duplicata entre os chamados do próprio solicitante. É um filtro
 * barato e determinístico: quem decide se é "o mesmo problema" é o agent, que
 * confirma com o funcionário antes de atualizar.
 */
export function findDuplicateCandidates(
  tickets: Ticket[],
  query: { title: string; description?: string; category?: Category },
  now: number,
  threshold = 0.2,
): DuplicateCandidate[] {
  const queryText = `${query.title} ${query.description ?? ""}`;
  const out: DuplicateCandidate[] = [];
  for (const ticket of tickets) {
    const open = ticket.status !== "Resolvido";
    if (!open && !canReopen(ticket, now)) continue;
    let score = similarity(queryText, `${ticket.title} ${ticket.description}`);
    if (query.category && ticket.category === query.category) score += 0.15;
    if (score >= threshold) {
      out.push({ ticket, score, action: open ? "update" : "reopen" });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
