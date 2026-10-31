"use client";

import { Check, ChevronDown, Headset, Loader2, Repeat, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { AgentStep, Block, ChatMessage, DraftView, TicketView } from "@/chat/types";
import { DraftCard, TicketCard, TicketChoice } from "./ticket-ui";

/** Texto com **negrito** e parágrafos; nada além disso. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={i > 0 ? "mt-2" : ""}>
          {para.split(/(\*\*[^*]+\*\*)/).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**") ? (
              <strong key={j} className="font-semibold">
                {chunk.slice(2, -2)}
              </strong>
            ) : (
              <span key={j} className="whitespace-pre-wrap">
                {chunk}
              </span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

const short = (value: unknown) => {
  const s = JSON.stringify(value, null, 1) ?? "";
  return s.length > 600 ? `${s.slice(0, 600)}…` : s;
};

/** Passos do agent: o que ele consultou/fez antes de responder, com detalhes técnicos sob demanda. */
export function StepsBar({ steps, running }: { steps: AgentStep[]; running?: boolean }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0 && !running) return null;
  return (
    <div className="text-xs text-ink-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {steps.map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            {s.ok ? (
              <Check size={12} aria-hidden />
            ) : (
              <TriangleAlert size={12} className="text-warning-text" aria-hidden />
            )}
            {s.label}
          </span>
        ))}
        {running && (
          <span className="flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" aria-hidden /> trabalhando…
          </span>
        )}
        {steps.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-0.5 text-primary-text hover:underline"
          >
            detalhes
            <ChevronDown size={12} className={open ? "rotate-180" : ""} aria-hidden />
          </button>
        )}
      </div>
      {open && (
        <ol className="mt-2 flex flex-col gap-2 rounded-lg border border-rule bg-desk p-3 font-mono text-[11px] leading-relaxed text-ink-2">
          {steps.map((s, i) => (
            <li key={s.id}>
              <p className="font-semibold text-ink">
                {i + 1}. {s.tool} <span className="font-normal text-ink-3">· {s.ms} ms{s.ok ? "" : " · falhou"}</span>
              </p>
              <p className="mt-0.5 text-ink-3">entrada</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">{short(s.input)}</pre>
              <p className="mt-0.5 text-ink-3">saída</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">{short(s.output)}</pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export interface BlockHandlers {
  interactive: boolean;
  now: number;
  draftStatus: (draft: DraftView) => "pending" | "confirmed" | "cancelled";
  busyDraft: string | null;
  draftError: (id: string) => string | null;
  onChoice: (text: string) => void;
  onPickTicket: (t: TicketView) => void;
  onConfirm: (id: string) => void;
  onEdit: (draft: DraftView) => void;
  onCancel: (id: string) => void;
}

export function Blocks({ blocks, h }: { blocks: Block[]; h: BlockHandlers }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "draft":
            return (
              <DraftCard
                key={i}
                draft={b.draft}
                status={h.draftStatus(b.draft)}
                now={h.now}
                busy={h.busyDraft === b.draft.id}
                error={h.draftError(b.draft.id)}
                onConfirm={() => h.onConfirm(b.draft.id)}
                onEdit={() => h.onEdit(b.draft)}
                onCancel={() => h.onCancel(b.draft.id)}
              />
            );
          case "ticket-card":
            return <TicketCard key={i} ticket={b.ticket} now={h.now} />;
          case "ticket-result":
            return <TicketCard key={i} ticket={b.ticket} now={h.now} />;
          case "ticket-choice":
            return (
              <TicketChoice key={i} tickets={b.tickets} interactive={h.interactive} onPick={h.onPickTicket} />
            );
          case "choices":
            return (
              <div key={i} className="flex flex-wrap gap-2">
                {b.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={!h.interactive}
                    onClick={() => h.onChoice(o)}
                    className="h-8 rounded-lg border border-black/10 bg-paper px-3 text-[13px] font-medium text-ink enabled:hover:border-primary enabled:hover:bg-primary-soft disabled:cursor-default disabled:opacity-60"
                  >
                    {o}
                  </button>
                ))}
              </div>
            );
        }
      })}
    </>
  );
}

export function MessageView({
  message,
  h,
}: {
  message: ChatMessage;
  h: BlockHandlers;
}) {
  if (message.role === "system") {
    const icon = /assumiu|agent/.test(message.content) ? Headset : Repeat;
    const Icon = icon;
    return (
      <div className="flex items-center gap-3 text-xs text-ink-3" role="status">
        <span className="h-px flex-1 bg-rule" />
        <span className="flex items-center gap-1.5">
          <Icon size={13} aria-hidden /> {message.content}
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </p>
      </div>
    );
  }

  const author =
    message.role === "analyst"
      ? `${message.parts?.author?.name ?? "Analista"}${message.parts?.author?.level ? ` · Suporte ${message.parts.author.level}` : ""}`
      : "Nexo Assist";

  return (
    <div className="flex max-w-[92%] flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-ink">{author}</span>
        {message.role === "agent" && <StepsBar steps={message.parts?.steps ?? []} />}
      </div>
      <div
        className={`rounded-[14px] border px-3.5 py-3 text-sm leading-relaxed text-ink ${
          message.role === "analyst" ? "border-success/30 bg-success-soft" : "border-rule bg-paper shadow-[0_1px_2px_rgba(11,11,11,0.04)]"
        }`}
      >
        <RichText text={message.content} />
      </div>
      {message.parts?.blocks && <Blocks blocks={message.parts.blocks} h={h} />}
    </div>
  );
}
