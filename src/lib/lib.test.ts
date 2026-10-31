import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimit } from "./rate-limit";
import { signSession, verifySession } from "./session";

const SECRET = "segredo-de-teste";
const NOW = 1_800_000_000_000;

describe("sessão assinada", () => {
  it("aceita um token válido", () => {
    const token = signSession({ uid: "ana.souza", exp: NOW + 1000 }, SECRET);
    expect(verifySession(token, SECRET, NOW)).toEqual({ uid: "ana.souza", exp: NOW + 1000 });
  });

  it("rejeita token expirado, adulterado ou com outro segredo", () => {
    const token = signSession({ uid: "ana.souza", exp: NOW + 1000 }, SECRET);
    expect(verifySession(token, SECRET, NOW + 2000)).toBeNull();
    expect(verifySession(token, "outro-segredo", NOW)).toBeNull();

    const [, signature] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ uid: "rafael.lima", exp: NOW + 1000 })).toString("base64url")}.${signature}`;
    expect(verifySession(forged, SECRET, NOW)).toBeNull();
  });

  it("rejeita lixo e ausência de token", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBeNull();
    expect(verifySession("nada", SECRET, NOW)).toBeNull();
    expect(verifySession("a.b", SECRET, NOW)).toBeNull();
  });
});

describe("limite de requisições", () => {
  beforeEach(() => resetRateLimit());

  it("bloqueia depois do máximo e libera quando a janela passa", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 0 + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 1000, 1500).ok).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    expect(rateLimit("a", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, 1).ok).toBe(false);
  });
});
