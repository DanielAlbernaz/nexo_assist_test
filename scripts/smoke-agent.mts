/**
 * Roda uma conversa curta com o agent real, no terminal, para checar o fluxo
 * sem abrir a interface. Uso: npm run agent:smoke -- "mensagem 1" "mensagem 2"
 */
import { db } from "@/db/client";
import { runAgentTurn } from "@/agent/run-turn";
import { addMessage, getOrCreateConversation, listMessages } from "@/chat/repository";
import { createTicketClient } from "@/ticket-service/client";
import { TicketService } from "@/ticket-service/service";

const userId = process.env.SMOKE_USER ?? "ana.souza";
const tickets = createTicketClient(new TicketService(db));
const conv = await getOrCreateConversation(db, userId);

for (const text of process.argv.slice(2)) {
  console.log(`\n> ${text}`);
  await addMessage(db, { conversationId: conv.id, role: "user", content: text });
  const history = await listMessages(db, conv.id);
  for await (const ev of runAgentTurn({
    db,
    tickets,
    user: { id: userId, name: "Ana Souza", department: "Financeiro" },
    conversationId: conv.id,
    history,
  })) {
    if (ev.type === "step") console.log(`  [passo] ${ev.step.label} (${ev.step.ms}ms) ok=${ev.step.ok}`);
    else if (ev.type === "block") console.log(`  [card] ${ev.block.kind}`);
    else if (ev.type === "done") console.log(`  < ${ev.message.content}`);
    else if (ev.type === "error") console.log(`  [erro] ${ev.message}`);
  }
}
