import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { users } from "@/db/schema";
import { apiError, json } from "@/lib/api";
import { createSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/services";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (evita enumerar usuários).
const DUMMY_HASH = bcrypt.hashSync("senha-inexistente", 10);

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Informe e-mail e senha válidos.");
  const { email, password, remember } = parsed.data;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`login:${ip}:${email.toLowerCase()}`, 8, 10 * 60 * 1000);
  if (!limit.ok) {
    return apiError(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return apiError(401, "E-mail ou senha incorretos.");

  const cookie = createSessionCookie(user.id, remember ?? false);
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
  return json({ role: user.role });
}
