import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { tickets } from "@/db/schema";
import { createTicketClient, withRetry } from "./client";
import {
  ReopenNotAllowedError,
  TicketNotFoundError,
  TicketServiceUnavailableError,
} from "./errors";
import { TicketService, type CreateTicketInput } from "./service";
import { createTestDb } from "./test-db";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 28, 15, 0);

const draft: CreateTicketInput = {
  type: "INC",
  title: "VPN não conecta no notebook",
  description: "Desde ontem o notebook não conecta na VPN e mostra o erro 809.",
  category: "Rede e VPN",
  priority: "Alta",
  affected: "self",
};

function row(over: Partial<typeof tickets.$inferInsert>): typeof tickets.$inferInsert {
  return {
    id: "INC-20001",
    type: "INC",
    title: "Impressora sem conexão",
    description: "A impressora não aparece na lista.",
    category: "Hardware",
    priority: "Média",
    status: "Aberto",
    affected: "self",
    requesterId: "ana",
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    resolvedAt: null,
    ...over,
  };
}

let db: Db;
let service: TicketService;

beforeEach(async () => {
  db = await createTestDb();
  service = new TicketService(db, { now: () => NOW });
});

describe("privacidade", () => {
  beforeEach(async () => {
    await db.insert(tickets).values([
      row({ id: "INC-20001", requesterId: "ana" }),
      row({ id: "INC-20002", requesterId: "carla" }),
    ]);
  });

  it("lista só os chamados do próprio funcionário", async () => {
    const list = await service.listByRequester("ana");
    expect(list.map((t) => t.id)).toEqual(["INC-20001"]);
  });

  it("chamado de outra pessoa responde como não encontrado", async () => {
    await expect(service.getForRequester("INC-20002", "ana")).rejects.toBeInstanceOf(
      TicketNotFoundError,
    );
    await expect(service.addUpdate("INC-20002", "ana", "oi")).rejects.toBeInstanceOf(
      TicketNotFoundError,
    );
  });
});

describe("criação", () => {
  it("cria com status Aberto e numeração sequencial por tipo", async () => {
    await db.insert(tickets).values(row({ id: "INC-20510" }));
    const created = await service.create("ana", draft);
    expect(created).toMatchObject({ id: "INC-20511", status: "Aberto", requesterId: "ana" });
    const req = await service.create("ana", { ...draft, type: "REQ" });
    expect(req.id).toBe("REQ-10451");
  });

  it("rejeita chamado incompleto", async () => {
    await expect(
      service.create("ana", { ...draft, title: "x" }),
    ).rejects.toThrow();
  });
});

describe("atualização e reabertura", () => {
  it("atualizar zera o relógio do prazo", async () => {
    await db.insert(tickets).values(row({ updatedAt: NOW - 5 * DAY }));
    const updated = await service.addUpdate("INC-20001", "ana", "ainda acontece");
    expect(updated.updatedAt).toBe(NOW);
  });

  it("reabre chamado resolvido há até 7 dias", async () => {
    await db.insert(tickets).values(
      row({ status: "Resolvido", resolvedAt: NOW - 3 * DAY }),
    );
    const reopened = await service.reopen("INC-20001", "ana", "voltou a falhar");
    expect(reopened).toMatchObject({ status: "Aberto", resolvedAt: null });
  });

  it("não reabre resolvido há mais de 7 dias", async () => {
    await db.insert(tickets).values(
      row({ status: "Resolvido", resolvedAt: NOW - 8 * DAY }),
    );
    await expect(service.reopen("INC-20001", "ana", "x")).rejects.toBeInstanceOf(
      ReopenNotAllowedError,
    );
  });
});

describe("indisponibilidade do sistema legado", () => {
  it("falha como indisponível conforme a taxa configurada", async () => {
    const flaky = new TicketService(db, { failureRate: 1, now: () => NOW });
    await expect(flaky.listByRequester("ana")).rejects.toBeInstanceOf(
      TicketServiceUnavailableError,
    );
  });

  it("o cliente tenta de novo e se recupera", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TicketServiceUnavailableError())
      .mockRejectedValueOnce(new TicketServiceUnavailableError())
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: async () => {} })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("desiste depois de esgotar as tentativas", async () => {
    const fn = vi.fn().mockRejectedValue(new TicketServiceUnavailableError());
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toBeInstanceOf(
      TicketServiceUnavailableError,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("não repete erros de negócio", async () => {
    const fn = vi.fn().mockRejectedValue(new TicketNotFoundError("INC-1"));
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toBeInstanceOf(
      TicketNotFoundError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("createTicketClient expõe as operações com retry", async () => {
    const client = createTicketClient(service, { sleep: async () => {} });
    expect(await client.list("ana")).toEqual([]);
  });
});
