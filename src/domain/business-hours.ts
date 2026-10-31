/**
 * Horário útil do service desk: segunda a sexta, 8h–18h, fuso de Brasília
 * (UTC-3, sem horário de verão). Feriados não são considerados.
 * Trabalhamos em "relógio de Brasília" deslocando o timestamp em -3h e usando
 * os getters UTC, para o resultado não depender do fuso do servidor.
 */
const OFFSET_MS = -3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 18;
export const BUSINESS_HOURS_PER_DAY = CLOSE_HOUR - OPEN_HOUR;

function toLocal(ts: number): Date {
  return new Date(ts + OFFSET_MS);
}

function fromLocal(local: Date): number {
  return local.getTime() - OFFSET_MS;
}

function isWeekday(local: Date): boolean {
  const d = local.getUTCDay();
  return d >= 1 && d <= 5;
}

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/** Move para o próximo instante dentro do horário útil (ou o próprio, se já estiver). */
function rollToBusinessTime(local: Date): Date {
  let d = new Date(local);
  for (let i = 0; i < 10; i++) {
    const open = atHour(d, OPEN_HOUR);
    const close = atHour(d, CLOSE_HOUR);
    if (isWeekday(d)) {
      if (d < open) return open;
      if (d < close) return d;
    }
    d = atHour(new Date(d.getTime() + 24 * HOUR_MS), OPEN_HOUR);
  }
  return d;
}

export function isBusinessTime(ts: number): boolean {
  const l = toLocal(ts);
  return isWeekday(l) && l >= atHour(l, OPEN_HOUR) && l < atHour(l, CLOSE_HOUR);
}

/** Soma `hours` horas úteis a partir de `start`. */
export function addBusinessHours(start: number, hours: number): number {
  let cursor = rollToBusinessTime(toLocal(start));
  let remaining = hours * HOUR_MS;
  while (remaining > 0) {
    const close = atHour(cursor, CLOSE_HOUR);
    const available = close.getTime() - cursor.getTime();
    if (remaining <= available) {
      return fromLocal(new Date(cursor.getTime() + remaining));
    }
    remaining -= available;
    cursor = rollToBusinessTime(new Date(close.getTime() + 1));
  }
  return fromLocal(cursor);
}

/** Horas úteis decorridas entre `from` e `to` (0 se `to` <= `from`). */
export function businessHoursBetween(from: number, to: number): number {
  if (to <= from) return 0;
  let cursor = rollToBusinessTime(toLocal(from));
  const end = toLocal(to);
  let total = 0;
  while (cursor < end) {
    const close = atHour(cursor, CLOSE_HOUR);
    const stop = end < close ? end : close;
    total += stop.getTime() - cursor.getTime();
    cursor = rollToBusinessTime(new Date(close.getTime() + 1));
  }
  return total / HOUR_MS;
}
