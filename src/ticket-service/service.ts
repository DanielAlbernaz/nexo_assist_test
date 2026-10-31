import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { ticketNotes, tickets } from "@/db/schema";
import { canReopen } from "@/domain/reopen";
import {
  CATEGORIES,
  PRIORITIES,
  TICKET_TYPES,
  type Ticket,
  type TicketStatus,
} from "@/domain/types";
import {
  ReopenNotAllowedError,
  TicketNotFoundError,
  TicketServiceUnavailableError,
} from "./errors";

export const createTicketSchema = z.object({
  type: z.enum(TICKET_TYPES),
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(2000),
  category: z.enum(CATEGORIES),
  subcategory: z.string().max(60).nullish(),
  priority: z.enum(PRIORITIES),
  affected: z.enum(["self", "team", "company", "unknown"]),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export interface ServiceOptions {
  /** Atraso simulado por chamada (ms). */
  latencyMs?: number;
  /** Probabilidade (0–1) de a chamada falhar como "indisponível". */
  failureRate?: number;
  now?: () => number;
  random?: () => number;
}

/**
 * Sistema de chamados legado (simulado). É a única porta de acesso aos dados de
 * chamados: o agent nunca consulta as tabelas diretamente.
 *
 * Privacidade: toda operação exige o `requesterId` e só enxerga chamados desse
 * funcionário. Um chamado de outra pessoa responde como "não encontrado".
 */
export class TicketService {
  private readonly latencyMs: number;
  private readonly failureRate: number;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(
    private readonly db: Db,
    options: ServiceOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 0;
    this.failureRate = options.failureRate ?? 0;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  private async simulate(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
    if (this.failureRate > 0 && this.random() < this.failureRate) {
      throw new TicketServiceUnavailableError();
    }
  }

  async listByRequester(requesterId: string): Promise<Ticket[]> {
    await this.simulate();
    const rows = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.requesterId, requesterId))
      .orderBy(desc(tickets.updatedAt));
    return rows as Ticket[];
  }

  async getForRequester(id: string, requesterId: string): Promise<Ticket> {
    await this.simulate();
    return this.load(id, requesterId);
  }

  async create(requesterId: string, input: CreateTicketInput): Promise<Ticket> {
    await this.simulate();
    const data = createTicketSchema.parse(input);
    const now = this.now();
    const id = await this.nextId(data.type);
    const row = {
      id,
      type: data.type,
      title: data.title,
      description: data.description,
      category: data.category,
      subcategory: data.subcategory ?? null,
      priority: data.priority,
      status: "Aberto" as TicketStatus,
      affected: data.affected,
      requesterId,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    await this.db.insert(tickets).values(row);
    return row as Ticket;
  }

  /** Acrescenta informação ao chamado; zera o relógio do prazo. */
  async addUpdate(
    id: string,
    requesterId: string,
    note: string,
    author = "funcionário",
  ): Promise<Ticket> {
    await this.simulate();
    const ticket = await this.load(id, requesterId);
    const now = this.now();
    await this.db.insert(ticketNotes).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      author,
      body: note,
      createdAt: now,
    });
    await this.db.update(tickets).set({ updatedAt: now }).where(eq(tickets.id, id));
    return { ...ticket, updatedAt: now };
  }

  async setStatus(
    id: string,
    requesterId: string,
    status: TicketStatus,
  ): Promise<Ticket> {
    await this.simulate();
    const ticket = await this.load(id, requesterId);
    const now = this.now();
    const resolvedAt = status === "Resolvido" ? now : null;
    await this.db
      .update(tickets)
      .set({ status, updatedAt: now, resolvedAt })
      .where(eq(tickets.id, id));
    return { ...ticket, status, updatedAt: now, resolvedAt };
  }

  async reopen(id: string, requesterId: string, reason: string): Promise<Ticket> {
    await this.simulate();
    const ticket = await this.load(id, requesterId);
    const now = this.now();
    if (!canReopen(ticket, now)) throw new ReopenNotAllowedError(id);
    await this.db.insert(ticketNotes).values({
      id: crypto.randomUUID(),
      ticketId: id,
      author: "funcionário",
      body: `Reaberto: ${reason}`,
      createdAt: now,
    });
    await this.db
      .update(tickets)
      .set({ status: "Aberto", updatedAt: now, resolvedAt: null })
      .where(eq(tickets.id, id));
    return { ...ticket, status: "Aberto", updatedAt: now, resolvedAt: null };
  }

  private async load(id: string, requesterId: string): Promise<Ticket> {
    const [row] = await this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.requesterId, requesterId)))
      .limit(1);
    if (!row) throw new TicketNotFoundError(id);
    return row as Ticket;
  }

  private async nextId(type: "INC" | "REQ"): Promise<string> {
    const rows = await this.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.type, type));
    const max = rows.reduce((m, r) => Math.max(m, Number(r.id.split("-")[1])), 0);
    const floor = type === "INC" ? 20500 : 10450;
    return `${type}-${Math.max(max, floor) + 1}`;
  }
}
