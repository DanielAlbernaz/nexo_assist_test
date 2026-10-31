import { getSessionUser, type SessionUser } from "./auth";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(status: number, error: string, extra: object = {}): Response {
  return json({ error, ...extra }, status);
}

/** Retorna o usuário da sessão (com o papel exigido) ou uma resposta 401/403. */
export async function requireApiUser(
  role?: SessionUser["role"],
): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) return apiError(401, "Sessão expirada. Entre novamente.");
  if (role && user.role !== role) return apiError(403, "Sem permissão para esta ação.");
  return user;
}

export const isResponse = (v: unknown): v is Response => v instanceof Response;
