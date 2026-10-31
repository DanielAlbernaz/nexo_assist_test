const TZ = "America/Sao_Paulo";

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

/** "16 out" */
export function formatShortDate(ts: number): string {
  return new Date(ts)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: TZ })
    .replace(" de ", " ")
    .replace(".", "");
}

/** "16 out, 14:20" */
export function formatDateTime(ts: number): string {
  return `${formatShortDate(ts)}, ${formatTime(ts)}`;
}

const dayKey = (ts: number) =>
  new Date(ts).toLocaleDateString("pt-BR", { timeZone: TZ });

/** "há 5 dias", "há 3 h", "agora" */
export function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  return `há ${Math.floor(d / 7)} semanas`;
}

/** "resposta até 13:43" (hoje) ou "resposta até 02 nov, 10:00". */
export function formatDeadline(ts: number, now = Date.now()): string {
  return dayKey(ts) === dayKey(now) ? `até ${formatTime(ts)}` : `até ${formatDateTime(ts)}`;
}

/** Rótulo do dia para separadores: "Hoje", "Ontem" ou "16 out". */
export function formatDayLabel(ts: number, now = Date.now()): string {
  if (dayKey(ts) === dayKey(now)) return "Hoje";
  if (dayKey(ts) === dayKey(now - 86_400_000)) return "Ontem";
  return formatShortDate(ts);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
