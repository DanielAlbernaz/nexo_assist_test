import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { databaseAuthToken, databaseUrl } from "./env";
import { ensureLocalDbDir } from "./ensure-dir";
import * as schema from "./schema";

const url = databaseUrl();
ensureLocalDbDir(url);

const client = createClient({
  url,
  authToken: databaseAuthToken(),
});

export const db = drizzle(client, { schema });
export { client as rawClient };
export type Db = typeof db;
