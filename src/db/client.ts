import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ensureLocalDbDir } from "./ensure-dir";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/nexo.db";
ensureLocalDbDir(url);

const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

export const db = drizzle(client, { schema });
export { client as rawClient };
export type Db = typeof db;
