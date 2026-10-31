"use client";

/* Os handlers abaixo usam refs (fluxo de streaming, última mensagem lida) e são
   passados aos cards durante o render; o React Compiler lint não distingue isso de
   leitura de ref no render, mas nenhum ref é lido para decidir o que renderizar. */
/* eslint-disable react-hooks/refs, react-hooks/purity */

import { ArrowUp, Headset, Loader2, Lock, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStep, Block, ChatMessage, ConversationState, DraftView, TicketView } from "@/chat/types";
import { formatDayLabel } from "@/lib/format";
import { Blocks, MessageView, RichText, StepsBar, type BlockHandlers } from "./message";

interface ConversationInfo {
  id: string;
  state: ConversationState;
  messagesUsed: number;
  messagesMax: number;
  handoffLevel: string | null;
}

interface Live {
  steps: AgentStep[];
  text: string;
  blocks: Block[];
}

type DraftStatus = "pending" | "confirmed" | "cancelled";

const SUGGESTIONS = [
  "Meu notebook está muito lento",
  "Qual o status do meu chamado?",
  "Preciso de acesso a um sistema",
];

/** Eventos enviados por /api/chat. */
type StreamEvent =
  | { event: "user"; message: ChatMessage; messagesUsed: number }
  | { event: "step"; step: AgentStep }
  | { event: "text"; delta: string }
  | { event: "block"; block: Block }
  | { event: "done" | "message"; message: ChatMessage }
  | { event: "error"; message: string }
  | { event: "paused" | "end"; state?: ConversationState };

/** Lê um fluxo SSE (`event:` + `data:`) e chama `onEvent` a cada evento completo. */
async function readSse(res: Response, onEvent: (e: StreamEvent) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(raw)?.[1];
      if (data) onEvent({ event, ...JSON.parse(data) } as StreamEvent);
    }
  }
}

export function Chat({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [conv, setConv] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftStatus>>({});
  const [live, setLive] = useState<Live | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const streaming = useRef(false);
  const convId = useRef<string | null>(null);
  const lastTs = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [now, setNow] = useState(() => Date.now());

  const unauthorized = useCallback(() => router.replace("/login"), [router]);

  const refresh = useCallback(
    async (opts: { fresh?: boolean } = {}) => {
      try {
        const qs = new URLSearchParams();
        if (opts.fresh) qs.set("new", "1");
        else if (convId.current) {
          qs.set("conversation", convId.current);
          qs.set("after", String(lastTs.current));
        }
        const res = await fetch(`/api/conversation?${qs}`, { cache: "no-store" });
        if (res.status === 401) return unauthorized();
        if (!res.ok) throw new Error();
        const data = await res.json();
        const changed = convId.current !== data.conversation.id;
        convId.current = data.conversation.id;
        setConv(data.conversation);
        setDrafts(data.drafts);
        setMessages((prev) => {
          // A mensagem provisória (tmp-) só sai quando a versão salva chega do servidor;
          // se um refresh em andamento a descartasse antes, ela voltaria depois da resposta.
          const arrived = (m: ChatMessage) =>
            data.messages.some((d: ChatMessage) => d.role === "user" && d.content === m.content);
          const base = changed
            ? []
            : prev.filter((m) => !(m.id.startsWith("tmp-") && arrived(m)));
          const known = new Set(base.map((m) => m.id));
          return [...base, ...data.messages.filter((m: ChatMessage) => !known.has(m.id))];
        });
        const newest = data.messages.at(-1)?.createdAt;
        if (changed) lastTs.current = newest ?? 0;
        else if (newest) lastTs.current = Math.max(lastTs.current, newest);
        setNow(Date.now());
        setLoadError(null);
      } catch {
        setLoadError("Não consegui carregar a conversa. Tentando de novo…");
      } finally {
        setLoading(false);
      }
    },
    [unauthorized],
  );

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    // Mensagens de analista e mudanças de estado chegam por polling.
    const t = setInterval(() => {
      if (!streaming.current && document.visibilityState === "visible") refresh();
    }, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  const state = conv?.state ?? "agent";
  const limitReached = conv ? conv.messagesUsed >= conv.messagesMax : false;
  const canType = !loading && state !== "closed" && !limitReached && !live;

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || streaming.current || !canType) return;
    setSendError(null);
    setInput("");
    streaming.current = true;
    const tmp: ChatMessage = {
      id: `tmp-${Date.now()}`,
      conversationId: convId.current ?? "",
      role: "user",
      content: text,
      parts: null,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, tmp]);
    const withAgent = state === "agent";
    if (withAgent) setLive({ steps: [], text: "", blocks: [] });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 401) return unauthorized();
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setMessages((m) => m.filter((x) => x.id !== tmp.id));
        setInput(text);
        setSendError(err.error ?? "Não foi possível enviar sua mensagem.");
        setLive(null);
        return;
      }
      await readSse(res, (e) => {
        switch (e.event) {
          case "user":
            setMessages((m) => m.map((x) => (x.id === tmp.id ? e.message : x)));
            setConv((c) => (c ? { ...c, messagesUsed: e.messagesUsed } : c));
            break;
          case "step":
            setLive((l) => l && { ...l, steps: [...l.steps, e.step] });
            break;
          case "text":
            setLive((l) => l && { ...l, text: l.text + e.delta });
            break;
          case "block":
            setLive((l) => l && { ...l, blocks: [...l.blocks, e.block] });
            break;
          case "done":
          case "message": {
            const msg = e.message;
            setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
            if (e.event === "done") setLive(null);
            break;
          }
          case "error":
            setSendError(e.message);
            break;
        }
      });
    } catch {
      setSendError("A conexão caiu durante a resposta. Atualizei a conversa; tente de novo.");
    } finally {
      streaming.current = false;
      setLive(null);
      setNow(Date.now());
      await refresh();
      textarea.current?.focus();
    }
  }

  async function confirm(id: string) {
    setBusyDraft(id);
    setDraftErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/drafts/${id}/confirm`, { method: "POST" });
      if (res.status === 401) return unauthorized();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setDraftErrors((e) => ({ ...e, [id]: err.error ?? "Não foi possível confirmar." }));
        return;
      }
      await refresh();
    } catch {
      setDraftErrors((e) => ({ ...e, [id]: "Sem conexão. Seu rascunho foi mantido; tente de novo." }));
    } finally {
      setBusyDraft(null);
    }
  }

  async function cancel(id: string) {
    setBusyDraft(id);
    try {
      await fetch(`/api/drafts/${id}/cancel`, { method: "POST" });
      await refresh();
    } finally {
      setBusyDraft(null);
    }
  }

  function edit(draft: DraftView) {
    setInput(`Quero alterar o rascunho ${draft.id}: `);
    textarea.current?.focus();
  }

  const pendingDraftId = useMemo(() => {
    const ids = Object.entries(drafts).filter(([, s]) => s === "pending").map(([id]) => id);
    return ids.length ? ids[ids.length - 1]! : null;
  }, [drafts]);

  // ⌘/Ctrl + Enter confirma o rascunho pendente.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && pendingDraftId && !busyDraft) {
        e.preventDefault();
        confirm(pendingDraftId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraftId, busyDraft]);

  async function startNew() {
    setMessages([]);
    setLive(null);
    await refresh({ fresh: true });
  }

  const lastId = messages.at(-1)?.id;
  const handlersFor = (messageId: string): BlockHandlers => ({
    interactive: messageId === lastId && !live && state === "agent" && !limitReached,
    now,
    draftStatus: (d) => drafts[d.id] ?? d.status,
    busyDraft,
    draftError: (id) => draftErrors[id] || null,
    onChoice: (text) => send(text),
    onPickTicket: (t: TicketView) => send(`${t.id} · ${t.title}`),
    onConfirm: confirm,
    onEdit: edit,
    onCancel: cancel,
  });

  const emptyHandlers: BlockHandlers = { ...handlersFor(""), interactive: false };

  return (
    <div className="flex h-full flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex w-full max-w-[660px] flex-col gap-5 px-4 py-8">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-3" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden /> Carregando sua conversa…
            </div>
          )}

          {!loading && messages.length === 0 && !live && (
            <div className="flex flex-col items-start gap-4 py-10">
              <div>
                <h1 className="font-display text-[30px] leading-tight text-ink">Olá, {firstName}.</h1>
                <p className="mt-2 text-sm text-ink-3">
                  Descreva o que está acontecendo com sua TI. Eu consulto a central de ajuda e seus
                  chamados e, se precisar, chamo um analista.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!canType}
                    onClick={() => send(s)}
                    className="h-9 rounded-lg border border-black/10 bg-paper px-3 text-[13px] font-medium text-ink hover:border-primary hover:bg-primary-soft disabled:opacity-60"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || formatDayLabel(prev.createdAt, now) !== formatDayLabel(m.createdAt, now);
            return (
              <div key={m.id} className="flex flex-col gap-5">
                {newDay && i > 0 && (
                  <p className="self-center rounded-full bg-desk px-3 py-1 text-xs text-ink-3">
                    {formatDayLabel(m.createdAt, now)}
                  </p>
                )}
                <MessageView message={m} h={handlersFor(m.id)} />
              </div>
            );
          })}

          {live && (
            <div className="flex max-w-[92%] flex-col gap-2" aria-busy="true">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink">Nexo Assist</span>
                <StepsBar steps={live.steps} running={!live.text} />
              </div>
              {live.text ? (
                <div className="rounded-[14px] border border-rule bg-paper px-3.5 py-3 text-sm leading-relaxed text-ink shadow-[0_1px_2px_rgba(11,11,11,0.04)]">
                  <RichText text={live.text} />
                </div>
              ) : null}
              <Blocks blocks={live.blocks} h={emptyHandlers} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-rule bg-paper px-4 pb-3 pt-3">
        <div className="mx-auto flex w-full max-w-[660px] flex-col gap-2">
          {loadError && (
            <p role="status" className="flex items-center gap-2 text-xs text-warning-text">
              <TriangleAlert size={13} aria-hidden /> {loadError}
            </p>
          )}
          {sendError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
              {sendError}
            </p>
          )}
          {state === "waiting_analyst" && (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">
              <Headset size={14} aria-hidden /> Sua conversa foi transferida
              {conv?.handoffLevel ? ` para o Suporte ${conv.handoffLevel}` : ""}. Um analista vai
              falar com você aqui; pode deixar mais detalhes enquanto isso.
            </p>
          )}
          {state === "with_analyst" && (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success-text">
              <Headset size={14} aria-hidden /> Você está falando com um analista. O assistente está pausado.
            </p>
          )}
          {state === "closed" && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-desk px-3 py-2 text-[13px] text-ink-2">
              <span className="flex items-center gap-2"><Lock size={14} aria-hidden /> Atendimento encerrado.</span>
              <button onClick={startNew} className="rounded-lg bg-cta px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-hover">
                Nova conversa
              </button>
            </div>
          )}
          {limitReached && state !== "closed" && (
            <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">
              Você chegou ao limite de {conv?.messagesMax} mensagens desta conversa. Ligue no ramal
              4000 ou peça para um analista assumir.
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-[14px] border border-black/10 bg-paper p-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15"
          >
            <textarea
              ref={textarea}
              value={input}
              rows={1}
              maxLength={2000}
              disabled={!canType && !live}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Escreva para o Nexo…"
              aria-label="Mensagem para o Nexo Assist"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-subtle disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!canType || !input.trim()}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-cta px-3.5 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {live ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ArrowUp size={14} aria-hidden />}
              Enviar
            </button>
          </form>
          <p className="text-right text-xs text-ink-3">
            {conv ? `${conv.messagesUsed}/${conv.messagesMax} mensagens nesta sessão` : " "}
          </p>
        </div>
      </div>
    </div>
  );
}
