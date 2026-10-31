import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ReopenNotAllowedError,
  TicketNotFoundError,
  TicketServiceUnavailableError,
} from "./errors";
import { createTicketSchema, type TicketService } from "./service";

/**
 * Contrato HTTP do sistema de chamados: `POST /api/ticket-service/<op>` com JSON e
 * `Authorization: Bearer <token>`. Este lado traduz requisição → TicketService e
 * erros de negócio → status HTTP; o `http-client.ts` faz o caminho inverso.
 */
export const TICKET_OPS = ["list", "get", "create", "addUpdate", "reopen"] as const;
export type TicketOp = (typeof TICKET_OPS)[number];

export type TicketErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "reopen_not_allowed"
  | "unavailable"
  | "internal";

const requester = z.string().min(1);
const bodies = {
  list: z.object({ requesterId: requester }),
  get: z.object({ id: z.string().min(1), requesterId: requester }),
  create: z.object({ requesterId: requester, input: createTicketSchema }),
  addUpdate: z.object({
    id: z.string().min(1),
    requesterId: requester,
    note: z.string().min(1).max(2000),
    author: z.string().max(60).optional(),
  }),
  reopen: z.object({
    id: z.string().min(1),
    requesterId: requester,
    reason: z.string().min(1).max(500),
  }),
} satisfies Record<TicketOp, z.ZodType>;

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function fail(status: number, error: TicketErrorCode, message: string) {
  return reply(status, { error, message });
}

function authorized(req: Request, token: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleTicketServiceRequest(
  service: TicketService,
  token: string,
  op: string,
  req: Request,
): Promise<Response> {
  if (!authorized(req, token)) return fail(401, "unauthorized", "Token inválido.");
  if (!(TICKET_OPS as readonly string[]).includes(op)) {
    return fail(404, "invalid_request", `Operação desconhecida: ${op}.`);
  }
  const name = op as TicketOp;

  const parsed = bodies[name].safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
  }

  try {
    const data = parsed.data as never as Record<string, string> & {
      input: z.infer<typeof createTicketSchema>;
    };
    switch (name) {
      case "list":
        return reply(200, await service.listByRequester(data.requesterId));
      case "get":
        return reply(200, await service.getForRequester(data.id, data.requesterId));
      case "create":
        return reply(201, await service.create(data.requesterId, data.input));
      case "addUpdate":
        return reply(
          200,
          await service.addUpdate(data.id, data.requesterId, data.note, data.author),
        );
      case "reopen":
        return reply(200, await service.reopen(data.id, data.requesterId, data.reason));
    }
  } catch (err) {
    if (err instanceof TicketNotFoundError) return fail(404, "not_found", err.message);
    if (err instanceof ReopenNotAllowedError) {
      return fail(409, "reopen_not_allowed", err.message);
    }
    if (err instanceof TicketServiceUnavailableError) {
      return fail(503, "unavailable", err.message);
    }
    console.error("[ticket-service] erro", err);
    return fail(500, "internal", "Erro interno do sistema de chamados.");
  }
}
