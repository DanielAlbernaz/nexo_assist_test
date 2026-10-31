import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Cria a pasta do arquivo SQLite local (ex.: ./data) quando ela ainda não existe.
 * A pasta fica fora do Git, então num clone novo ela não está lá.
 */
export function ensureLocalDbDir(url: string): void {
  if (!url.startsWith("file:")) return;
  const file = url.slice("file:".length);
  if (!file || file.startsWith(":")) return;
  mkdirSync(path.dirname(file), { recursive: true });
}
