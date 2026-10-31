import { describe, expect, it } from "vitest";
import {
  addBusinessHours,
  businessHoursBetween,
  isBusinessTime,
} from "./business-hours";
import { findDuplicateCandidates } from "./duplicates";
import { computePriority } from "./priority";
import { canReopen } from "./reopen";
import { isOverdue, slaDeadline } from "./sla";
import type { Ticket } from "./types";

/** Horário de Brasília (UTC-3) -> timestamp. 2026-10-26 é segunda-feira. */
const brt = (day: number, hour: number, min = 0, month = 10) =>
  Date.UTC(2026, month - 1, day, hour + 3, min);

const DAY = 24 * 60 * 60 * 1000;

function ticket(over: Partial<Ticket>): Ticket {
  return {
    id: "INC-1",
    type: "INC",
    title: "Notebook lento após atualização",
    description: "Lentidão geral depois da atualização do Windows",
    category: "Hardware",
    subcategory: null,
    priority: "Média",
    status: "Aberto",
    affected: "self",
    requesterId: "u1",
    createdAt: brt(26, 10),
    updatedAt: brt(26, 10),
    resolvedAt: null,
    ...over,
  };
}

describe("horário útil", () => {
  it("reconhece expediente de seg a sex, 8h–18h", () => {
    expect(isBusinessTime(brt(26, 9))).toBe(true);
    expect(isBusinessTime(brt(26, 7, 59))).toBe(false);
    expect(isBusinessTime(brt(26, 18))).toBe(false);
    expect(isBusinessTime(brt(31, 10))).toBe(false); // sábado
  });

  it("soma horas dentro do mesmo dia", () => {
    expect(addBusinessHours(brt(26, 10), 4)).toBe(brt(26, 14));
  });

  it("atravessa o fim de semana", () => {
    // sexta 16h + 4h úteis = 2h na sexta + 2h na segunda (8h→10h)
    expect(addBusinessHours(brt(30, 16), 4)).toBe(brt(2, 10, 0, 11));
  });

  it("começa a contar na abertura do expediente quando o início é fora dele", () => {
    expect(addBusinessHours(brt(31, 12), 1)).toBe(brt(2, 9, 0, 11)); // sábado
    expect(addBusinessHours(brt(26, 6), 1)).toBe(brt(26, 9)); // antes das 8h
  });

  it("vira o dia quando o expediente acaba", () => {
    expect(addBusinessHours(brt(26, 17, 30), 1)).toBe(brt(27, 8, 30));
  });

  it("calcula horas úteis decorridas", () => {
    expect(businessHoursBetween(brt(30, 17), brt(2, 9, 0, 11))).toBe(2);
    expect(businessHoursBetween(brt(26, 9), brt(26, 12))).toBe(3);
    expect(businessHoursBetween(brt(26, 12), brt(26, 9))).toBe(0);
  });
});

describe("prazos (SLA)", () => {
  it("crítica é 1 hora corrida, mesmo fora do expediente", () => {
    expect(slaDeadline("Crítica", brt(31, 22))).toBe(brt(31, 23));
  });

  it("alta é 4 horas úteis", () => {
    expect(slaDeadline("Alta", brt(26, 9))).toBe(brt(26, 13));
  });

  it("média é 3 dias úteis (30h úteis)", () => {
    expect(slaDeadline("Média", brt(26, 10))).toBe(brt(29, 10));
  });

  it("baixa é 5 dias úteis (50h úteis)", () => {
    expect(slaDeadline("Baixa", brt(26, 8))).toBe(brt(30, 18));
  });

  it("marca como vencido quando passa do prazo desde a última atualização", () => {
    const t = ticket({ priority: "Média", updatedAt: brt(26, 14, 20) });
    expect(isOverdue(t, brt(31, 12))).toBe(true);
    expect(isOverdue(t, brt(27, 12))).toBe(false);
  });

  it("chamado resolvido nunca está vencido", () => {
    const t = ticket({ status: "Resolvido", updatedAt: brt(1, 10, 0, 10) });
    expect(isOverdue(t, brt(31, 12))).toBe(false);
  });
});

describe("prioridade (impacto × urgência)", () => {
  const base = { type: "INC", affected: "self", blocking: false, sameDayCommitment: false } as const;

  it("equipe ou empresa parada é crítica", () => {
    expect(computePriority({ ...base, affected: "team", blocking: true })).toBe("Crítica");
    expect(computePriority({ ...base, affected: "company", blocking: true })).toBe("Crítica");
  });

  it("impede uma pessoa de trabalhar ou compromisso no dia é alta", () => {
    expect(computePriority({ ...base, blocking: true })).toBe("Alta");
    expect(computePriority({ ...base, sameDayCommitment: true })).toBe("Alta");
  });

  it("equipe afetada mas sem bloqueio não é crítica", () => {
    expect(computePriority({ ...base, affected: "team" })).toBe("Média");
  });

  it("incidente que atrapalha com alternativa é média", () => {
    expect(computePriority(base)).toBe("Média");
  });

  it("pedido sem urgência é baixa; com compromisso no dia sobe para alta", () => {
    expect(computePriority({ ...base, type: "REQ" })).toBe("Baixa");
    expect(computePriority({ ...base, type: "REQ", sameDayCommitment: true })).toBe("Alta");
  });

  it("'não sei' é tratado como uma pessoa", () => {
    expect(computePriority({ ...base, affected: "unknown", blocking: true })).toBe("Alta");
  });
});

describe("reabertura", () => {
  const now = brt(31, 12);

  it("permite reabrir até 7 dias depois de resolvido", () => {
    expect(canReopen({ status: "Resolvido", resolvedAt: now - 6 * DAY }, now)).toBe(true);
    expect(canReopen({ status: "Resolvido", resolvedAt: now - 7 * DAY }, now)).toBe(true);
  });

  it("não permite depois de 7 dias nem se não estiver resolvido", () => {
    expect(canReopen({ status: "Resolvido", resolvedAt: now - 8 * DAY }, now)).toBe(false);
    expect(canReopen({ status: "Aberto", resolvedAt: null }, now)).toBe(false);
  });
});

describe("duplicidade", () => {
  const now = brt(31, 12);
  const vpn = ticket({
    id: "INC-2",
    title: "VPN não conecta no notebook",
    description: "Erro 809 ao conectar na VPN",
    category: "Rede e VPN",
  });

  it("encontra chamado aberto parecido para atualizar", () => {
    const found = findDuplicateCandidates(
      [vpn, ticket({})],
      { title: "VPN com erro 809", category: "Rede e VPN" },
      now,
    );
    expect(found[0]?.ticket.id).toBe("INC-2");
    expect(found[0]?.action).toBe("update");
  });

  it("sugere reabrir um resolvido há até 7 dias", () => {
    const resolved = { ...vpn, status: "Resolvido" as const, resolvedAt: now - 3 * DAY };
    const found = findDuplicateCandidates([resolved], { title: "VPN erro 809" }, now);
    expect(found[0]?.action).toBe("reopen");
  });

  it("ignora resolvidos há mais de 7 dias e assuntos diferentes", () => {
    const old = { ...vpn, status: "Resolvido" as const, resolvedAt: now - 10 * DAY };
    expect(findDuplicateCandidates([old], { title: "VPN erro 809" }, now)).toHaveLength(0);
    expect(findDuplicateCandidates([vpn], { title: "Impressora sem toner" }, now)).toHaveLength(0);
  });
});
