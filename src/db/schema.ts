import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  department: text("department").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["employee", "analyst"] }).notNull(),
  /** Só para analistas: "N1" ou "N2". */
  level: text("level"),
  passwordChangedAt: integer("password_changed_at").notNull(),
});

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  body: text("body").notNull(),
});

/** Tabelas do serviço de chamados (legado simulado). */
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: ["INC", "REQ"] }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    affected: text("affected").notNull(),
    requesterId: text("requester_id").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [index("tickets_requester_idx").on(t.requesterId)],
);

export const ticketNotes = sqliteTable("ticket_notes", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Estado de cada conversa: com o agent, aguardando atendente, com analista... */
export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    state: text("state", {
      enum: ["agent", "waiting_analyst", "with_analyst", "closed"],
    }).notNull(),
    analystId: text("analyst_id"),
    /** Resumo do caso, preenchido na transferência. */
    handoffSummary: text("handoff_summary"),
    handoffReason: text("handoff_reason"),
    handoffAt: integer("handoff_at"),
    /** Última confiança do agent (0–1), para sinalizar "pediu ajuda". */
    confidence: integer("confidence_pct"),
    userMessageCount: integer("user_message_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("conv_user_idx").on(t.userId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull(),
    role: text("role", { enum: ["user", "agent", "analyst", "system"] }).notNull(),
    content: text("content").notNull(),
    /** JSON: passos do agent, cards (rascunho, chamado, lista), opções rápidas. */
    parts: text("parts"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("msg_conv_idx").on(t.conversationId)],
);

/** Rascunhos de chamado aguardando confirmação do funcionário. */
export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  userId: text("user_id").notNull(),
  /** JSON com os campos do chamado. */
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "confirmed", "cancelled"] }).notNull(),
  /** Se o rascunho atualiza/reabre um chamado existente. */
  targetTicketId: text("target_ticket_id"),
  createdAt: integer("created_at").notNull(),
});
