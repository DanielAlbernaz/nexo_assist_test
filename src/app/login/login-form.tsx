"use client";

import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar agora.");
        return;
      }
      router.replace(data.role === "analyst" ? "/console" : "/chat");
      router.refresh();
    } catch {
      setError("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  const field =
    "flex h-11 items-center gap-2.5 rounded-[10px] border border-black/10 bg-paper px-3 text-sm text-ink shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20";

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2 text-[13px] font-medium text-ink">
        E-mail corporativo
        <span className={field}>
          <Mail size={16} className="text-ink-3" aria-hidden />
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome.sobrenome@nexo.com.br"
            className="w-full bg-transparent font-normal outline-none placeholder:text-subtle"
          />
        </span>
      </label>

      <label className="flex flex-col gap-2 text-[13px] font-medium text-ink">
        <span className="flex items-center justify-between">
          Senha
          <span className="font-medium text-cta">Esqueci minha senha</span>
        </span>
        <span className={field}>
          <Lock size={16} className="text-ink-3" aria-hidden />
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent font-normal outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            className="text-ink-3 hover:text-ink"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>

      <label className="flex items-center gap-2 text-[13px] text-ink-2">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="size-4 accent-cta"
        />
        Manter conectado neste computador
      </label>

      {error && (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-cta text-sm font-semibold text-white shadow-md transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Entrando…
          </>
        ) : (
          <>
            Entrar <ArrowRight size={16} aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
