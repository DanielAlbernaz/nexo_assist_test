"use client";

import {
  Bot,
  ChevronRight,
  Hand,
  Headset,
  Loader2,
  LogOut,
  MessageSquare,
  Repeat,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ConversationState, TicketView } from "@/chat/types";
import { formatDeadline, formatTime, initials } from "@/lib/format";
import { NexoMark } from "./brand";
import { StatusBadge } from "./ticket-ui";

interface ConvRow {
  id: string;
  state: ConversationState;
  user: { id: string; name: string; department: string };
  analystId: string | null;
  analystName: string | null;
  lastMessage: { role: string; content: string; createdAt: number } | null;
  updatedAt: number;
  handoffReason: string | null;
  confidence: number | null;
  handoffDeadline: number | null;
  handoffLevel: string | null;
}

interface Detail {
  conversation: {
    id: string;
    state: ConversationState;
    analystId: string | null;
    handoffReason: string | null;
    handoffSummary: string | null;
    handoffAt: number | null;
    handoffLevel: string | null;
    handoffDeadline: number | null;
    confidence: number | null;
  };
  user: { id: string; name: string; department: string; email: string } | null;
  messages: ChatMessage[];
  tickets: TicketView[];
  ticketsError: string | null;
}

type Filter = "all" | "mine" | "waiting" | "agent";

const REASON_LABEL: Record<string, string> = {
  user_request: "Pediu um analista",
  critical: "Caso crítico",
  overdue: "Chamado vencido",
  low_confidence: "O agent não teve segurança",
};

const AVATAR_COLORS = [
  "bg-primary-soft text-primary-text",
  "bg-success-soft text-success-text",
  "bg-violet-soft text-violet-text",
  "bg-warning-soft text-warning-text",
  "bg-danger-soft text-danger-text",
];
const colorFor = (id: string) =>
  AVATAR_COLORS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_COLORS.length]!;

function Avatar({ name, id, size = 40 }: { name: string; id: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colorFor(id)}`}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function statusLine(c: ConvRow, meId: string) {
  switch (c.state) {
    case "waiting_analyst": {
      const reason =
        c.handoffReason === "low_confidence"
          ? `Agent pediu ajuda${c.confidence != null ? ` · confiança ${c.confidence}%` : ""}`
          : `Transferida · ${REASON_LABEL[c.handoffReason ?? ""] ?? "aguardando"}`;
      return { text: reason, cls: c.handoffReason === "low_confidence" ? "text-warning-text" : "text-danger-text", dot: c.handoffReason === "low_confidence" ? "bg-warning" : "bg-danger" };
    }
    case "with_analyst":
      return c.analystId === meId
        ? { text: "Você está atendendo", cls: "text-primary-text", dot: "bg-primary" }
        : { text: `${c.analystName ?? "Outro analista"} atendendo`, cls: "text-ink-3", dot: "bg-subtle" };
    case "agent":
      return { text: "Agent atendendo", cls: "text-ink-3", dot: "bg-success" };
    default:
      return { text: "Encerrada", cls: "text-ink-3", dot: "bg-subtle" };
  }
}

export function Console({ me }: { me: { id: string; name: string; level: string | null } }) {
  const router = useRouter();
  const [rows, setRows] = useState<ConvRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadList = useCallback(async () => {
    const res = await fetch("/api/console/conversations", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return router.replace("/login");
    if (!res.ok) throw new Error();
    const data = await res.json();
    setRows(data.conversations);
    setNow(Date.now());
  }, [router]);

  const loadDetail = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/console/conversations/${id}`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) return router.replace("/login");
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    },
    [router],
  );

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadList().catch(() => setError("Sem conexão. Tentando novamente…"));
      if (selected) loadDetail(selected).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [loadList, loadDetail, selected]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [detail?.messages.length, selected]);

  function select(id: string) {
    setSelected(id);
    setDetail(null);
    setError(null);
  }

  async function act(action: "assume" | "return" | "close") {
    if (!selected) return;
    setActing(true);
    setError(null);
    try {
      const res = await fetch(`/api/console/conversations/${selected}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Não foi possível concluir.");
      await Promise.all([loadList(), loadDetail(selected)]);
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setActing(false);
    }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || !selected) return;
    setInput("");
    setError(null);
    const res = await fetch(`/api/console/conversations/${selected}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      setInput(content);
      setError((await res.json().catch(() => ({}))).error ?? "Não foi possível enviar.");
      return;
    }
    await loadDetail(selected);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const counts = useMemo(() => {
    const r = rows ?? [];
    return {
      all: r.length,
      waiting: r.filter((c) => c.state === "waiting_analyst").length,
      agent: r.filter((c) => c.state === "agent").length,
      mine: r.filter((c) => c.state === "with_analyst" && c.analystId === me.id).length,
    };
  }, [rows, me.id]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((c) => {
      if (filter === "waiting" && c.state !== "waiting_analyst") return false;
      if (filter === "agent" && c.state !== "agent") return false;
      if (filter === "mine" && !(c.state === "with_analyst" && c.analystId === me.id)) return false;
      if (!q) return true;
      return (
        c.user.name.toLowerCase().includes(q) ||
        (c.lastMessage?.content.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, filter, query, me.id]);

  const conv = detail?.conversation;
  const mine = conv?.state === "with_analyst" && conv.analystId === me.id;
  const open = detail?.tickets.filter((t) => t.status !== "Resolvido") ?? [];
  const closed = detail?.tickets.filter((t) => t.status === "Resolvido") ?? [];

  const tabs: { id: Filter; label: string; count?: number; highlight?: boolean }[] = [
    { id: "all", label: "Todas" },
    { id: "waiting", label: "Para você", count: counts.waiting, highlight: true },
    { id: "agent", label: "Com o agent", count: counts.agent },
    { id: "mine", label: "Minhas", count: counts.mine },
  ];

  return (
    <div className="flex h-screen bg-paper text-ink">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-4 border-r border-rule bg-desk py-4" aria-label="Menu">
        <NexoMark size={22} />
        <span className="relative flex size-9 items-center justify-center rounded-lg bg-paper shadow-sm" title="Conversas">
          <MessageSquare size={17} aria-hidden />
          {counts.waiting > 0 && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-cta text-[10px] font-semibold text-white">
              {counts.waiting}
            </span>
          )}
        </span>
        <button onClick={logout} title="Sair" className="mt-auto flex flex-col items-center gap-2 text-ink-3 hover:text-ink">
          <Avatar name={me.name} id={me.id} size={32} />
          <LogOut size={15} aria-label="Sair" />
        </button>
      </nav>

      <section className="flex w-[340px] shrink-0 flex-col border-r border-rule" aria-label="Lista de conversas">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h1 className="text-xl font-bold tracking-tight">Conversas</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success-text">
            <span className="size-1.5 rounded-full bg-success" /> Disponível
          </span>
        </div>
        <label className="mx-4 flex h-9 items-center gap-2 rounded-full bg-card px-3 text-[13px] text-ink-3">
          <Search size={14} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa"
            className="w-full bg-transparent text-ink outline-none placeholder:text-subtle"
          />
        </label>
        <div className="flex flex-wrap gap-1.5 px-4 py-3" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={filter === t.id}
              onClick={() => setFilter(t.id)}
              className={`h-7 rounded-full px-3 text-xs font-medium ${
                filter === t.id ? "bg-primary-soft text-primary-text" : "bg-card text-ink-2 hover:bg-card-strong"
              }`}
            >
              {t.label}
              {t.count ? <span className={`ml-1 ${t.highlight ? "font-semibold text-primary-text" : "text-ink-3"}`}>{t.count}</span> : null}
            </button>
          ))}
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {rows === null && (
            <li className="flex items-center justify-center gap-2 py-10 text-sm text-ink-3" role="status">
              <Loader2 size={15} className="animate-spin" aria-hidden /> Carregando…
            </li>
          )}
          {rows !== null && visible.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-ink-3">Nenhuma conversa neste filtro.</li>
          )}
          {visible.map((c) => {
            const s = statusLine(c, me.id);
            const active = c.id === selected;
            return (
              <li key={c.id}>
                <button
                  onClick={() => select(c.id)}
                  aria-current={active}
                  className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-3 text-left ${active ? "bg-desk" : "hover:bg-desk/60"}`}
                >
                  <Avatar name={c.user.name} id={c.user.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{c.user.name}</span>
                      <span className="shrink-0 text-xs text-ink-3">{formatTime(c.updatedAt)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                      {c.lastMessage ? `${c.lastMessage.role === "agent" ? "Nexo: " : ""}${c.lastMessage.content}` : "Sem mensagens"}
                    </span>
                    <span className={`mt-1 flex items-center gap-1.5 text-xs ${s.cls}`}>
                      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden /> {s.text}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {!selected ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-desk text-ink-3">
          <MessageSquare size={28} aria-hidden />
          <p className="text-sm">Selecione uma conversa para ver o histórico.</p>
        </main>
      ) : !detail ? (
        <main className="flex flex-1 items-center justify-center gap-2 bg-desk text-sm text-ink-3" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Carregando conversa…
        </main>
      ) : (
        <>
          <main className="flex min-w-0 flex-1 flex-col bg-desk">
            <header className="flex items-center gap-3 border-b border-rule bg-paper px-4 py-3">
              <Avatar name={detail.user?.name ?? "?"} id={detail.user?.id ?? "?"} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[15px] font-semibold">{detail.user?.name}</p>
                <p className="truncate text-xs text-ink-3">{detail.user?.department} · {detail.user?.email}</p>
              </div>
              {conv?.state === "waiting_analyst" && (
                <span className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1 text-xs font-medium text-warning-text">
                  <Hand size={13} aria-hidden /> Aguardando atendente
                </span>
              )}
              {conv?.state === "agent" && (
                <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success-text">
                  <Bot size={13} aria-hidden /> Agent atendendo
                </span>
              )}
              {conv?.state === "closed" && (
                <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-ink-3">Encerrada</span>
              )}
              {mine && (
                <>
                  <button disabled={acting} onClick={() => act("return")} className="flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-paper px-3 text-[13px] font-medium hover:bg-card disabled:opacity-60">
                    <Undo2 size={14} aria-hidden /> Devolver ao agent
                  </button>
                  <button disabled={acting} onClick={() => act("close")} className="flex h-9 items-center gap-2 rounded-lg bg-danger-soft px-3 text-[13px] font-medium text-danger-text hover:bg-danger/20 disabled:opacity-60">
                    <ShieldCheck size={14} aria-hidden /> Encerrar atendimento
                  </button>
                </>
              )}
            </header>

            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-6 py-5" aria-live="polite">
              <div className="mx-auto flex max-w-[640px] flex-col gap-3">
                {detail.messages.map((m) => {
                  if (m.role === "system") {
                    return (
                      <div key={m.id} className="flex items-center gap-3 py-1 text-xs text-ink-3" role="status">
                        <span className="h-px flex-1 bg-black/10" />
                        <span className="flex items-center gap-1.5">
                          {/assumiu/.test(m.content) ? <Headset size={12} aria-hidden /> : <Repeat size={12} aria-hidden />}
                          {m.content} · {formatTime(m.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-black/10" />
                      </div>
                    );
                  }
                  const fromUser = m.role === "user";
                  const tag =
                    m.role === "agent"
                      ? { name: "Nexo Assist", badge: "IA", badgeCls: "bg-primary-soft text-primary-text" }
                      : m.role === "analyst"
                        ? { name: m.parts?.author?.name ?? "Analista", badge: m.parts?.author?.level ? `Suporte ${m.parts.author.level}` : "Analista", badgeCls: "bg-success-soft text-success-text" }
                        : null;
                  return (
                    <div key={m.id} className={`flex flex-col gap-1 ${fromUser ? "items-start" : "items-end"}`}>
                      {tag && (
                        <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                          {tag.name} <span className={`rounded px-1 font-semibold ${tag.badgeCls}`}>{tag.badge}</span>
                        </span>
                      )}
                      <p
                        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-[14px] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                          fromUser ? "bg-paper" : m.role === "analyst" ? "bg-success-soft" : "bg-primary-soft"
                        }`}
                      >
                        {m.content.replace(/\*\*/g, "")}
                        <span className="ml-2 align-bottom text-[10px] text-ink-3">{formatTime(m.createdAt)}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="border-t border-rule bg-paper px-4 py-3">
              {error && (
                <p role="alert" className="mb-2 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
                  <TriangleAlert size={14} aria-hidden /> {error}
                </p>
              )}
              {conv && !mine && conv.state !== "closed" && (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Hand size={18} className="text-warning-text" aria-hidden />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-sm font-semibold">
                      {conv.state === "waiting_analyst"
                        ? `${detail.user?.name.split(" ")[0]} espera um atendente`
                        : conv.state === "with_analyst"
                          ? "Outro analista está atendendo"
                          : "O agent está atendendo"}
                    </p>
                    <p className="text-xs text-ink-3">
                      {conv.state === "waiting_analyst" && conv.handoffDeadline
                        ? `Agent pausado · primeiro contato ${formatDeadline(conv.handoffDeadline, now)}`
                        : conv.state === "agent"
                          ? "Você pode assumir quando quiser; o agent para de responder."
                          : "Somente quem assumiu pode responder."}
                    </p>
                  </div>
                  {conv.state !== "with_analyst" && (
                    <button disabled={acting} onClick={() => act("assume")} className="flex h-9 items-center gap-2 rounded-lg bg-cta px-3.5 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                      {acting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Headset size={14} aria-hidden />}
                      Assumir atendimento
                    </button>
                  )}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={!mine}
                  maxLength={4000}
                  placeholder={mine ? "Escreva para o funcionário…" : "Assuma o atendimento para responder"}
                  aria-label="Mensagem para o funcionário"
                  className="h-10 flex-1 rounded-xl bg-card px-3.5 text-sm outline-none placeholder:text-subtle disabled:cursor-not-allowed disabled:opacity-70"
                />
                <button type="submit" disabled={!mine || !input.trim()} aria-label="Enviar" className="flex size-10 items-center justify-center rounded-full bg-cta text-white hover:bg-primary-hover disabled:opacity-40">
                  <Send size={16} aria-hidden />
                </button>
              </form>
            </footer>
          </main>

          <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-rule bg-paper xl:flex" aria-label="Chamados do funcionário">
            <div className="border-b border-rule px-4 py-3.5 leading-tight">
              <p className="text-sm font-semibold">Chamados de {detail.user?.name.split(" ")[0]}</p>
              <p className="text-xs text-ink-3">{open.length} abertos · {closed.length} encerrados</p>
            </div>

            {conv?.handoffSummary && conv.state !== "agent" && (
              <section className="px-4 pt-4">
                <h2 className="text-xs font-semibold text-ink-3">Resumo da transferência</h2>
                <div className="mt-2 rounded-xl border border-rule bg-desk p-3 text-[13px] leading-relaxed">
                  <p className="text-xs font-semibold text-warning-text">
                    {REASON_LABEL[conv.handoffReason ?? ""] ?? "Transferida"}
                    {conv.confidence != null ? ` · confiança ${conv.confidence}%` : ""}
                  </p>
                  <p className="mt-1 text-ink-2">{conv.handoffSummary}</p>
                </div>
              </section>
            )}

            <section className="px-4 py-4">
              {detail.ticketsError && (
                <p role="alert" className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-text">
                  {detail.ticketsError}
                </p>
              )}
              <h2 className="text-xs font-semibold text-ink-3">Abertos</h2>
              <ul className="mt-1 divide-y divide-rule">
                {open.length === 0 && <li className="py-3 text-[13px] text-ink-3">Nenhum chamado aberto.</li>}
                {open.map((t) => (
                  <TicketRow key={t.id} t={t} />
                ))}
              </ul>
              {closed.length > 0 && (
                <>
                  <h2 className="mt-4 text-xs font-semibold text-ink-3">Encerrados</h2>
                  <ul className="mt-1 divide-y divide-rule">
                    {closed.map((t) => (
                      <TicketRow key={t.id} t={t} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          </aside>
        </>
      )}
      <span className="sr-only" aria-hidden>{now}</span>
    </div>
  );
}

function TicketRow({ t }: { t: TicketView }) {
  return (
    <li className="flex items-center gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{t.title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
          <span className="font-mono">{t.id}</span>
          <StatusBadge status={t.status} />
          {t.overdue && <span className="font-medium text-warning-text">vencido</span>}
        </p>
      </div>
      <ChevronRight size={14} className="text-ink-3" aria-hidden />
    </li>
  );
}
