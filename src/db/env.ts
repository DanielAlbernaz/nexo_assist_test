/**
 * Conexão com o banco a partir do ambiente. Aceita DATABASE_URL /
 * DATABASE_AUTH_TOKEN e também os nomes que a integração Turso da Vercel cria
 * (DATABASE_TURSO_DATABASE_URL / DATABASE_TURSO_AUTH_TOKEN, conforme o prefixo).
 * Sem nenhum deles usa o arquivo local, só para desenvolvimento.
 */
export function databaseUrl(): string {
  const url =
    process.env.DATABASE_URL || process.env.DATABASE_TURSO_DATABASE_URL || "file:./data/nexo.db";
  if (process.env.VERCEL && url.startsWith("file:")) {
    throw new Error(
      "Banco não configurado: defina DATABASE_URL (Turso) nas variáveis de ambiente da Vercel.",
    );
  }
  return url;
}

export function databaseAuthToken(): string | undefined {
  return process.env.DATABASE_AUTH_TOKEN || process.env.DATABASE_TURSO_AUTH_TOKEN || undefined;
}
