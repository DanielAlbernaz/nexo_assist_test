import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  uid: string;
  /** Expiração, em ms desde a época. */
  exp: number;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");

function mac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Token assinado (HMAC-SHA256): `payload.assinatura`. */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${mac(body, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.uid !== "string" || typeof payload.exp !== "number") return null;
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}
