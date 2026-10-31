import { defineConfig } from "@playwright/test";

const PORT = 3200;

/**
 * Testes de interface sem o modelo: sobem o app compilado com um banco próprio
 * (data/e2e.db) recriado com o seed e exercitam login, permissões e o console.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "pt-BR" },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { E2E_PORT: String(PORT) },
  },
});
