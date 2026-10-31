import { addBusinessHours } from "@/domain/business-hours";
import type { Db } from "@/db/client";
import { addMessage, setState } from "./repository";
import type { HandoffReason } from "./types";

const HOUR_MS = 60 * 60 * 1000;

/** Nível do analista e prazo para o primeiro contato, por motivo da transferência. */
export function handoffInfo(reason: HandoffReason, handoffAt: number) {
  switch (reason) {
    case "critical":
      return { level: "N2", etaLabel: "1 hora", deadline: handoffAt + HOUR_MS };
    case "overdue":
      return { level: "N2", etaLabel: "2 horas úteis", deadline: addBusinessHours(handoffAt, 2) };
    default:
      return { level: "N1", etaLabel: "4 horas úteis", deadline: addBusinessHours(handoffAt, 4) };
  }
}

export interface HandoffInput {
  conversationId: string;
  reason: HandoffReason;
  /** Resumo do caso para o analista não precisar perguntar de novo. */
  summary: string;
  /** Confiança do agent (0–1), usada quando a causa é falta de segurança. */
  confidence?: number;
  now?: number;
}

export async function requestHandoff(db: Db, input: HandoffInput) {
  const now = input.now ?? Date.now();
  const info = handoffInfo(input.reason, now);
  await setState(
    db,
    input.conversationId,
    "waiting_analyst",
    {
      handoffReason: input.reason,
      handoffSummary: input.summary,
      handoffAt: now,
      analystId: null,
      // Só faz sentido mostrar confiança quando a causa foi falta de segurança.
      confidence:
        input.reason === "low_confidence" && input.confidence !== undefined
          ? Math.round(input.confidence * 100)
          : null,
    },
    now,
  );
  await addMessage(db, {
    conversationId: input.conversationId,
    role: "system",
    content: `Transferida para Suporte ${info.level}`,
    now: now + 1,
  });
  return info;
}
