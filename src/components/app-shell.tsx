"use client";

import { LogOut, MessageSquare, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { initials } from "@/lib/format";

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const current = path.startsWith("/perfil") ? "Meu perfil" : "Atendimento";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = [
    { href: "/chat", label: "Atendimento", icon: MessageSquare },
    { href: "/perfil", label: "Meu perfil", icon: User },
  ];

  return (
    <div className="flex h-screen bg-paper text-ink">
      <aside className="hidden w-[184px] shrink-0 flex-col border-r border-rule px-3 py-5 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] ${
                  active ? "bg-primary-soft font-semibold text-primary-text" : "text-ink-2 hover:bg-desk"
                }`}
              >
                <Icon size={16} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-rule pt-4">
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-text">
              {initials(user.name)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{user.name}</p>
              <p className="truncate text-[11px] text-ink-3">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-3 flex h-8 items-center gap-2 px-2 text-[13px] text-ink-2 hover:text-ink"
          >
            <LogOut size={15} aria-hidden /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-rule px-5 text-[13px]">
          <nav aria-label="Você está em" className="flex items-center gap-2 text-ink-3">
            <span>Service desk de TI</span>
            <span aria-hidden>›</span>
            <span className="font-semibold text-ink">{current}</span>
          </nav>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success-text">
              <span className="size-1.5 rounded-full bg-success" /> Assistente online
            </span>
            <button onClick={logout} className="text-ink-3 hover:text-ink md:hidden" aria-label="Sair">
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
