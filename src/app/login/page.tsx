import { redirect } from "next/navigation";
import { Brand, NexoMark } from "@/components/brand";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "analyst" ? "/console" : "/chat");

  return (
    <main className="flex min-h-screen flex-col bg-paper lg:flex-row">
      <section className="flex flex-col justify-between bg-ink px-8 py-10 text-white lg:w-[55%] lg:px-16 lg:pb-12">
        <Brand light />

        <div className="my-12 flex max-w-[560px] flex-col gap-9 lg:my-0">
          <div className="flex flex-col gap-4">
            <p className="text-xs text-white/60">Service desk de TI da Nexo</p>
            <h1 className="font-display text-[40px] leading-[1.08] tracking-tight lg:text-[52px]">
              Seu problema de TI, resolvido em uma conversa.
            </h1>
            <p className="max-w-[460px] text-[15px] leading-relaxed text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na
              central de ajuda e chama um analista quando precisa.
            </p>
          </div>

          <div className="hidden flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-[13px] sm:flex">
            <div className="self-end rounded-lg bg-white px-3 py-2 text-ink">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
            <p className="text-white/50">
              <span className="font-semibold text-white/80">Nexo Assist</span> consultou seus
              chamados · criou um chamado
            </p>
            <div className="max-w-[300px] rounded-lg bg-white/10 px-3 py-2 text-white/90">
              Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h
              úteis.
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink">
              <span className="size-1.5 rounded-full bg-warning" />
              <b className="font-mono font-medium">INC-20517</b>
              <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
            </div>
          </div>
        </div>

        <dl className="hidden grid-cols-3 gap-6 border-t border-white/10 pt-6 lg:grid">
          {[
            ["8 s", "primeira resposta, em média"],
            ["72%", "resolvidos sem fila"],
            ["6", "analistas online agora"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="font-display text-[28px] leading-none">{value}</dt>
              <dd className="mt-1.5 text-xs text-white/55">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-1 flex-col px-8 py-8 lg:px-16">
        <p className="self-end text-[13px] text-ink-3">
          Problema para entrar? <b className="font-medium text-cta">Ligue no ramal 4000</b>
        </p>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <NexoMark size={22} />
          </div>
          <h2 className="font-display text-[34px] leading-tight text-ink">Entrar</h2>
          <p className="mt-2 text-sm text-ink-3">
            Use seu e-mail corporativo e a senha da rede Nexo.
          </p>
          <LoginForm />
        </div>
        <footer className="flex items-center justify-between text-xs text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
