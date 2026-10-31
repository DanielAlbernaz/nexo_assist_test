"use client";

import { Check, Command, CornerDownLeft, Loader2, X } from "lucide-react";
import type { DraftView, TicketView } from "@/chat/types";
import { formatDateTime, formatDeadline, formatRelative, formatShortDate } from "@/lib/format";
import type { Priority, TicketStatus } from "@/domain/types";

const STATUS_STYLE: Record<TicketStatus, { dot: string; text: string }> = {
  Aberto: { dot: "bg-primary", text: "text-primary-text" },
  "Em andamento": { dot: "bg-primary", text: "text-primary-text" },
  "Aguardando analista": { dot: "bg-warning", text: "text-warning-text" },
  Aprovado: { dot: "bg-success", text: "text-success-text" },
  Resolvido: { dot: "bg-subtle", text: "text-ink-3" },
};

const PRIORITY_DOT: Record<Priority, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warning",
  Média: "bg-subtle",
  Baixa: "bg-black/20",
};

export function StatusBadge({ status }: { status: TicketStatus | string }) {
  const s = STATUS_STYLE[status as TicketStatus] ?? STATUS_STYLE.Aberto;
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden /> {status}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: Priority }) {
  return <span className={`size-1.5 rounded-full ${PRIORITY_DOT[priority]}`} aria-hidden />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-3">{label}</p>
      <div className="mt-1 text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

const cardShell =
  "overflow-hidden rounded-[14px] border border-rule bg-paper shadow-[0_1px_3px_rgba(11,11,11,0.06)]";

export function TicketCard({ ticket, now }: { ticket: TicketView; now: number }) {
  return (
    <article className={`${cardShell} p-4`} aria-label={`Chamado ${ticket.id}`}>
      <header className="flex items-center justify-between gap-3 text-xs">
        <span className="text-ink-3">
          Chamado <span aria-hidden>·</span> <span className="font-mono">{ticket.id}</span>
        </span>
        <StatusBadge status={ticket.status} />
      </header>
      <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{ticket.title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{ticket.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-rule pt-3 sm:grid-cols-4">
        <Field label="Categoria">
          {ticket.category}
          {ticket.subcategory ? ` › ${ticket.subcategory}` : ""}
        </Field>
        <Field label="Prioridade">
          <span className="flex items-center gap-1.5">
            <PriorityDot priority={ticket.priority} /> {ticket.priority}
          </span>
        </Field>
        <Field label="Aberto em">{formatDateTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          <span className={ticket.overdue ? "text-warning-text" : ""}>
            {formatRelative(ticket.updatedAt, now)}
          </span>
          {ticket.overdue && (
            <span className="ml-1 font-normal text-warning-text"> · prazo vencido</span>
          )}
        </Field>
      </div>
    </article>
  );
}

export function TicketChoice({
  tickets,
  interactive,
  onPick,
}: {
  tickets: TicketView[];
  interactive: boolean;
  onPick: (t: TicketView) => void;
}) {
  return (
    <ul className={`${cardShell} divide-y divide-rule`} role="listbox" aria-label="Seus chamados">
      {tickets.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            disabled={!interactive}
            onClick={() => onPick(t)}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-sm enabled:hover:bg-desk disabled:cursor-default"
          >
            <span className="size-4 shrink-0 rounded-full border border-black/20" aria-hidden />
            <span className="w-[74px] shrink-0 font-mono text-xs text-ink-3">{t.id}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
            <span className="hidden sm:block">
              <StatusBadge status={t.status} />
            </span>
            <span className="w-11 shrink-0 text-right text-xs text-ink-3">
              {formatShortDate(t.updatedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const AFFECTED_LABEL = {
  self: "Somente você",
  team: "Sua equipe",
  company: "Toda a empresa",
  unknown: "Não informado",
} as const;

const DRAFT_TITLE = {
  create: "Novo chamado",
  update: "Atualizar chamado",
  reopen: "Reabrir chamado",
} as const;

export function DraftCard({
  draft,
  status,
  now,
  busy,
  error,
  onConfirm,
  onEdit,
  onCancel,
}: {
  draft: DraftView;
  status: "pending" | "confirmed" | "cancelled";
  now: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const pending = status === "pending";
  const confirmLabel =
    draft.action === "create" ? "Confirmar" : draft.action === "update" ? "Confirmar atualização" : "Confirmar reabertura";

  return (
    <article className={cardShell} aria-label={`Rascunho ${draft.id}`}>
      <div className="p-4">
        <header className="flex items-center justify-between gap-3 text-xs">
          <span className="text-ink-3">
            {DRAFT_TITLE[draft.action]}
            {draft.targetTicketId && <span className="font-mono"> {draft.targetTicketId}</span>} <span aria-hidden>·</span>{" "}
            Rascunho <span className="font-mono">{draft.id}</span>
          </span>
          {pending ? (
            <span className="flex items-center gap-1.5 font-medium text-warning-text">
              <span className="size-1.5 rounded-full bg-warning" aria-hidden /> Aguardando confirmação
            </span>
          ) : status === "confirmed" ? (
            <span className="flex items-center gap-1 font-medium text-success-text">
              <Check size={13} aria-hidden /> Confirmado
            </span>
          ) : (
            <span className="flex items-center gap-1 font-medium text-ink-3">
              <X size={13} aria-hidden /> Cancelado
            </span>
          )}
        </header>
        <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{draft.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{draft.description}</p>
        {draft.note && (
          <p className="mt-2 rounded-lg bg-desk px-3 py-2 text-[13px] text-ink-2">
            <span className="font-semibold">
              {draft.action === "reopen" ? "Motivo da reabertura: " : "Informação nova: "}
            </span>
            {draft.note}
          </p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-4 border-t border-rule pt-3 sm:grid-cols-3">
          <Field label="Categoria">{draft.category}</Field>
          <Field label="Prioridade">
            <span className="flex flex-wrap items-center gap-x-1.5">
              <PriorityDot priority={draft.priority} /> {draft.priority}
              <span className="font-normal text-ink-3">· resposta {formatDeadline(draft.deadline, now)}</span>
            </span>
          </Field>
          <Field label="Afetados">{AFFECTED_LABEL[draft.affected]}</Field>
        </div>
      </div>
      {pending && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-rule bg-desk px-3 py-2.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-8 items-center gap-2 rounded-lg bg-cta px-3 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {confirmLabel}
            <kbd className="hidden items-center gap-0.5 rounded bg-white/20 px-1 text-[10px] font-medium sm:flex">
              <Command size={9} aria-hidden />
              <CornerDownLeft size={9} aria-hidden />
            </kbd>
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            className="h-8 rounded-lg border border-black/10 bg-paper px-3 text-[13px] font-medium text-ink hover:bg-card disabled:opacity-60"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-8 px-3 text-[13px] text-ink-2 hover:text-ink disabled:opacity-60"
          >
            Cancelar
          </button>
          {error && (
            <p role="alert" className="basis-full text-xs text-danger-text">
              {error}
            </p>
          )}
        </footer>
      )}
    </article>
  );
}
