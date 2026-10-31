import { defineConfig } from "drizzle-kit";
import { databaseAuthToken, databaseUrl } from "./src/db/env";
import { ensureLocalDbDir } from "./src/db/ensure-dir";

const url = databaseUrl();
ensureLocalDbDir(url);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: databaseAuthToken(),
  },
});
