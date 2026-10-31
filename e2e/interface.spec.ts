import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "nexo123";

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByPlaceholder("nome.sobrenome@nexo.com.br").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Entrar/ }).click();
}

async function as(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  return { context, page };
}

test("senha errada mostra erro e não entra", async ({ page }) => {
  await login(page, "ana.souza@nexo.com.br", "senha-errada");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("sem login, o chat redireciona para o login", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login/);
});

test("funcionário não acessa o console do analista", async ({ browser }) => {
  const { context, page } = await as(browser, "ana.souza@nexo.com.br");
  await expect(page).toHaveURL(/\/chat/);
  await page.goto("/console");
  await expect(page).not.toHaveURL(/\/console/);
  await context.close();
});

test("analista entra no console e vê as conversas aguardando", async ({ browser }) => {
  const { context, page } = await as(browser, "rafael.lima@nexo.com.br");
  await expect(page).toHaveURL(/\/console/);
  await expect(page.getByRole("region", { name: "Lista de conversas" })).toContainText("Carla");
  await context.close();
});

test("analista assume, responde e o funcionário vê a resposta no chat", async ({ browser }) => {
  const analyst = await as(browser, "rafael.lima@nexo.com.br");
  const employee = await as(browser, "carla.mendes@nexo.com.br");
  await expect(employee.page).toHaveURL(/\/chat/);

  await analyst.page
    .getByRole("region", { name: "Lista de conversas" })
    .getByText("Carla", { exact: false })
    .first()
    .click();
  await analyst.page.getByRole("button", { name: /Assumir atendimento/ }).click();

  const reply = "Olá Carla, já liberei o seu acesso ao SAP.";
  await analyst.page.getByLabel("Mensagem para o funcionário").fill(reply);
  await analyst.page.getByRole("button", { name: "Enviar" }).click();

  // O chat do funcionário atualiza por polling a cada 3 s.
  await expect(employee.page.getByText(reply)).toBeVisible({ timeout: 15_000 });

  await analyst.context.close();
  await employee.context.close();
});

test("funcionária sem conversa transferida vê o campo de mensagem do chat", async ({ browser }) => {
  const { context, page } = await as(browser, "gabriela.rocha@nexo.com.br");
  await expect(page.getByLabel("Mensagem para o Nexo Assist")).toBeVisible();
  await context.close();
});
