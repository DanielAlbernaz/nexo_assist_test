import type { Db } from "@/db/client";
import { articles } from "@/db/schema";

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na", "um",
  "uma", "para", "por", "com", "que", "meu", "minha", "nao", "esta", "ao", "se", "ou",
  "como", "faco", "fazer", "preciso", "quero",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export interface ArticleHit {
  id: string;
  title: string;
  category: string;
  body: string;
  score: number;
}

/** Busca por palavras na central de ajuda (título pesa mais que o corpo). */
export async function searchArticles(db: Db, query: string, limit = 3): Promise<ArticleHit[]> {
  const q = new Set(tokens(query));
  if (q.size === 0) return [];
  const rows = await db.select().from(articles);
  return rows
    .map((a) => {
      const title = new Set(tokens(a.title));
      const body = new Set(tokens(a.body));
      let score = 0;
      for (const t of q) {
        if (title.has(t)) score += 2;
        if (body.has(t)) score += 1;
      }
      return { ...a, score };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
