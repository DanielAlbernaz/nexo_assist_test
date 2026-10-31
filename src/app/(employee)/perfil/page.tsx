import { KeyRound, Lock, Mail } from "lucide-react";
import { requireUser } from "@/lib/auth";

const daysSince = (ts: number) => Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));

export default async function ProfilePage() {
  const user = await requireUser("employee");
  const days = daysSince(user.passwordChangedAt);
  const card = "overflow-hidden rounded-[14px] border border-rule bg-paper shadow-sm";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[480px] flex-col gap-6 px-5 py-12">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Meu perfil</h1>
          <p className="mt-1 text-sm text-ink-3">Seus dados de acesso ao service desk de TI.</p>
        </div>

        <div className={card}>
          <div className="flex items-center gap-8 border-b border-rule px-5 py-3.5 text-sm">
            <span className="w-28 text-ink-3">Nome</span>
            <span className="font-medium">{user.name}</span>
          </div>
          <div className="flex items-center gap-8 px-5 py-3.5 text-sm">
            <span className="w-28 text-ink-3">E-mail corporativo</span>
            <span className="min-w-0 flex-1 truncate font-medium">{user.email}</span>
            <span className="flex items-center gap-1.5 text-xs text-ink-3">
              <Lock size={12} aria-hidden /> Gerenciado pela TI
            </span>
          </div>
        </div>

        <div className={card}>
          <div className="flex items-center gap-3.5 px-5 py-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-card">
              <KeyRound size={18} className="text-ink-2" aria-hidden />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">Senha</p>
              <p className="text-xs text-ink-3">
                Alterada há {days} {days === 1 ? "dia" : "dias"}
              </p>
            </div>
            <span
              title="Use 'Esqueci minha senha' na tela de login. Nesta demonstração nenhum e-mail é enviado."
              className="cursor-default rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium text-ink-2"
            >
              Redefinir senha
            </span>
          </div>
          <div className="flex items-center gap-2 border-t border-rule bg-desk px-5 py-2.5 text-xs text-ink-3">
            <Mail size={13} aria-hidden /> Enviaremos um link de redefinição para {user.email}.
          </div>
        </div>
      </div>
    </div>
  );
}
