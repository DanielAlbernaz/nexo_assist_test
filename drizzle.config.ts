import { defineConfig } from "drizzle-kit";
import { ensureLocalDbDir } from "./src/db/ensure-dir";

const url = process.env.DATABASE_URL ?? "file:./data/nexo.db";
ensureLocalDbDir(url);

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  },
});
