import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { tickets } from "@/db/schema";
import { handleTicketServiceRequest } from "./http";
import { createHttpTicketClient, fetchTransport, type TicketTransport } from "./http-client";
import {
  ReopenNotAllowedError,
  TicketNotFoundError,
  TicketServiceUnavailableError,
} from "./errors";
import { TicketService, type CreateTicketInput } from "./service";
import { createTestDb } from "./test-db";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 28, 15, 0);
const TOKEN = "segredo-de-teste";
const noSleep = { sleep: async () => {} };

const draft: CreateTicketInput = {
  type: "INC",
  title: "VPN não conecta no notebook",
  description: "Desde ontem o notebook não conecta na VPN e mostra o erro 809.",
  category: "Rede e VPN",
  priority: "Alta",
  affected: "self",
};

let db: Db;

/** Transporte que chama o handler HTTP direto, sem rede, mantendo o contrato. */
function transportFor(service: TicketService, token = TOKEN): TicketTransport {
  return (op, payload) =>
    handleTicketServiceRequest(
      service,
      TOKEN,
      op,
      new Request(`http://internal/api/ticket-service/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      }),
    );
}

beforeEach(async () => {
  db = await createTestDb();
});

describe("contrato HTTP do sistema de chamados", () => {
  it("cria, consulta, atualiza e reabre pelo cliente HTTP", async () => {
    const client = createHttpTicketClient(
      transportFor(new TicketService(db, { now: () => NOW })),
      noSleep,
    );
    const created = await client.create("ana", draft);
    expect(created.id).toMatch(/^INC-/);
    expect((await client.list("ana")).map((t) => t.id)).toEqual([created.id]);
    expect((await client.get(created.id, "ana")).title).toBe(draft.title);
    const updated = await client.addUpdate(created.id, "ana", "Continua igual.");
    expect(updated.updatedAt).toBe(NOW);

    await db.insert(tickets).values({
      ...created,
      id: "INC-29999",
      status: "Resolvido",
      resolvedAt: NOW - 2 * DAY,
    });
    expect((await client.reopen("INC-29999", "ana", "Voltou a falhar")).status).toBe("Aberto");
  });

  it("chamado de outra pessoa vira TicketNotFoundError (404), sem vazar existência", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const client = createHttpTicketClient(transportFor(service), noSleep);
    const created = await client.create("ana", draft);
    await expect(client.get(created.id, "carla")).rejects.toBeInstanceOf(TicketNotFoundError);
    expect(await client.list("carla")).toEqual([]);
  });

  it("reabertura fora do prazo vira ReopenNotAllowedError (409), sem retry", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const transport = vi.fn(transportFor(service));
    const client = createHttpTicketClient(transport, noSleep);
    await db.insert(tickets).values({
      id: "INC-29998",
      type: "INC",
      title: "Antigo",
      description: "Chamado resolvido há muito tempo.",
      category: "Hardware",
      priority: "Baixa",
      status: "Resolvido",
      affected: "self",
      requesterId: "ana",
      createdAt: NOW - 30 * DAY,
      updatedAt: NOW - 20 * DAY,
      resolvedAt: NOW - 20 * DAY,
    });
    await expect(client.reopen("INC-29998", "ana", "De novo")).rejects.toBeInstanceOf(
      ReopenNotAllowedError,
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("indisponibilidade (503) é repetida e depois sobe como TicketServiceUnavailableError", async () => {
    const down = new TicketService(db, { failureRate: 1 });
    const transport = vi.fn(transportFor(down));
    const client = createHttpTicketClient(transport, noSleep);
    await expect(client.list("ana")).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("falha de rede também vira indisponibilidade e é repetida", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const ok = transportFor(service);
    const transport = vi
      .fn<TicketTransport>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementation(ok);
    const client = createHttpTicketClient(transport, noSleep);
    expect(await client.list("ana")).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("rejeita token errado (401) e não toca nos dados", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const client = createHttpTicketClient(transportFor(service, "outro-token"), noSleep);
    await expect(client.create("ana", draft)).rejects.toThrow(/unauthorized/);
    expect(await db.select().from(tickets)).toHaveLength(0);
  });

  it("valida o corpo: rascunho inválido responde 400", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const res = await handleTicketServiceRequest(
      service,
      TOKEN,
      "create",
      new Request("http://internal/api/ticket-service/create", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ requesterId: "ana", input: { title: "x" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("operação desconhecida responde 404", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const res = await handleTicketServiceRequest(
      service,
      TOKEN,
      "drop",
      new Request("http://internal/api/ticket-service/drop", {
        method: "POST",
        headers: { authorization: `Bearer ${TOKEN}` },
        body: "{}",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("transporte de rede: manda POST com token e JSON e mapeia a resposta", async () => {
    const service = new TicketService(db, { now: () => NOW });
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://chamados.exemplo/api/ticket-service/create");
      expect(init?.method).toBe("POST");
      return handleTicketServiceRequest(
        service,
        TOKEN,
        "create",
        new Request(String(url), init),
      );
    }) as unknown as typeof fetch;
    const client = createHttpTicketClient(
      fetchTransport("https://chamados.exemplo/api/ticket-service/", TOKEN, { fetchImpl }),
      noSleep,
    );
    const created = await client.create("ana", draft);
    expect(created.requesterId).toBe("ana");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
