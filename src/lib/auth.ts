import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireEnv } from "./config";
import { signSession, verifySession } from "./session";

export const SESSION_COOKIE = "nexo_session";
const SHORT_TTL_MS = 12 * 60 * 60 * 1000;
const LONG_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  department: string;
  role: "employee" | "analyst";
  level: string | null;
  passwordChangedAt: number;
}

export function createSessionCookie(userId: string, remember: boolean) {
  const ttl = remember ? LONG_TTL_MS : SHORT_TTL_MS;
  return {
    name: SESSION_COOKIE,
    value: signSession({ uid: userId, exp: Date.now() + ttl }, requireEnv("SESSION_SECRET")),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Sem "manter conectado" o cookie dura só até fechar o navegador.
      ...(remember ? { maxAge: LONG_TTL_MS / 1000 } : {}),
    },
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySession(token, requireEnv("SESSION_SECRET"));
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.uid)).limit(1);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    role: user.role,
    level: user.level,
    passwordChangedAt: user.passwordChangedAt,
  };
}

/** Para páginas: redireciona ao login se não houver sessão ou o papel não servir. */
export async function requireUser(role?: SessionUser["role"]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect(user.role === "analyst" ? "/console" : "/chat");
  return user;
}
