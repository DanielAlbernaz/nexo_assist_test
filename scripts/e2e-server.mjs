// Prepara o banco de testes de interface e sobe o app compilado.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const port = process.env.E2E_PORT ?? "3200";
const env = {
  ...process.env,
  DATABASE_URL: "file:./data/e2e.db",
  DATABASE_AUTH_TOKEN: "",
  SESSION_SECRET: "e2e-segredo-apenas-para-testes-de-interface",
  GOOGLE_GENERATIVE_AI_API_KEY: "sem-uso-nos-testes-de-interface",
  NODE_ENV: "production",
};

mkdirSync("data", { recursive: true });
rmSync("data/e2e.db", { force: true });
execSync("npm run db:setup", { stdio: "inherit", env: { ...env, NODE_ENV: "development" } });
execSync("npx next build", { stdio: "inherit", env });
const server = spawn(`npx next start -p ${port}`, { stdio: "inherit", env, shell: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill());
server.on("exit", (code) => process.exit(code ?? 0));
