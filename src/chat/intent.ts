/**
 * Atalhos determinísticos: quando há um rascunho pendente e o funcionário escreve
 * só "sim" ou "cancelar", tratamos direto, sem gastar uma chamada ao modelo.
 */
const CONFIRM =
  /^\s*(sim|confirmo|confirmar|confirmado|pode (criar|abrir|confirmar|seguir)|ok|isso( mesmo)?|certo|beleza)[\s.!]*$/i;
const CANCEL = /^\s*(cancelar?|n[aã]o|deixa( pra l[aá])?|desisti)[\s.!]*$/i;

export function draftIntent(text: string): "confirm" | "cancel" | null {
  if (CONFIRM.test(text)) return "confirm";
  if (CANCEL.test(text)) return "cancel";
  return null;
}
