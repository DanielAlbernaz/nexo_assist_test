import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";

/** Banco SQLite em memória com o schema real, para testes isolados. */
export async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema);
  const statements = await generateSQLiteMigration(empty, current);
  for (const sql of statements) await client.execute(sql);
  return drizzle(client, { schema }) as unknown as Db;
}
