import bcrypt from "bcryptjs";
import { db } from "./client";
import {
  articles,
  conversations,
  drafts,
  messages,
  ticketNotes,
  tickets,
  users,
} from "./schema";

/**
 * Dados de exemplo. Todas as datas são relativas a "agora", para que os cenários
 * (vencido, resolvido recentemente, fora da janela de reabertura) continuem
 * válidos em qualquer dia em que o seed rodar.
 *
 * Senha de todos os usuários de teste: SEED_PASSWORD (apenas desenvolvimento).
 */
export const SEED_PASSWORD = "nexo123";

const H = 60 * 60 * 1000;
const D = 24 * H;

export async function runSeed() {
  const now = Date.now();
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);

  await db.delete(drafts);
  await db.delete(messages);
  await db.delete(conversations);
  await db.delete(ticketNotes);
  await db.delete(tickets);
  await db.delete(articles);
  await db.delete(users);

  const employee = (id: string, name: string, dept: string, daysAgo = 42) => ({
    id,
    email: `${id}@nexo.com.br`,
    name,
    department: dept,
    passwordHash: hash,
    role: "employee" as const,
    level: null,
    passwordChangedAt: now - daysAgo * D,
  });

  await db.insert(users).values([
    { ...employee("ana.souza", "Ana Souza", "Financeiro") },
    { ...employee("carla.mendes", "Carla Mendes", "Comercial", 10) },
    { ...employee("bruno.tavares", "Bruno Tavares", "Jurídico", 80) },
    { ...employee("diego.ramos", "Diego Ramos", "Operações", 5) },
    { ...employee("elisa.prado", "Elisa Prado", "Marketing", 30) },
    { ...employee("fabio.nunes", "Fábio Nunes", "Comercial", 60) },
    { ...employee("gabriela.rocha", "Gabriela Rocha", "RH", 15) },
    {
      ...employee("rafael.lima", "Rafael Lima", "Service desk"),
      role: "analyst" as const,
      level: "N2",
    },
    {
      ...employee("julia.costa", "Júlia Costa", "Service desk"),
      role: "analyst" as const,
      level: "N1",
    },
  ]);

  await db.insert(articles).values([
    {
      id: "kb-vpn-809",
      title: "VPN com erro 809",
      category: "Rede e VPN",
      body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    },
    {
      id: "kb-horario",
      title: "Horário do service desk",
      category: "Outros",
      body: "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    },
    {
      id: "kb-senha-rede",
      title: "Redefinir a senha da rede",
      category: "Acesso",
      body: "Acesse a página de login e use 'Esqueci minha senha'. Você receberá um link de redefinição no e-mail corporativo. A senha precisa ter 12 caracteres ou mais. Senhas de sistemas como o SAP não são redefinidas por esse link: abra um chamado de acesso.",
    },
    {
      id: "kb-outlook-celular",
      title: "Outlook não sincroniza no celular",
      category: "E-mail",
      body: "Abra o aplicativo, vá em Configurações, toque na conta corporativa e escolha 'Redefinir conta'. Se a senha da rede mudou recentemente, entre novamente com a nova senha. Se o erro continuar, abra um chamado informando o modelo do aparelho.",
    },
    {
      id: "kb-notebook-lento",
      title: "Notebook lento",
      category: "Hardware",
      body: "Reinicie o computador, feche programas que não usa e libere pelo menos 10 GB de disco. Rode o diagnóstico da central de ajuda (menu Iniciar > Diagnóstico Nexo). Se a lentidão continuar depois disso, abra um chamado de hardware.",
    },
    {
      id: "kb-wifi",
      title: "Wi-Fi corporativo",
      category: "Rede e VPN",
      body: "Conecte na rede Nexo-Corp com seu e-mail corporativo e a senha da rede. Visitantes usam a rede Nexo-Visitas, com a senha do dia fornecida pela recepção.",
    },
    {
      id: "kb-impressora",
      title: "Adicionar impressora de rede",
      category: "Hardware",
      body: "Abra Configurações > Impressoras > Adicionar e procure pelo nome do andar (por exemplo, IMP-3A). Se a impressora não aparecer, confirme que está na rede Nexo-Corp. Se continuar sem aparecer, abra um chamado informando o andar.",
    },
    {
      id: "kb-software",
      title: "Instalar software",
      category: "Software",
      body: "Programas do catálogo são instalados pelo portal de softwares, sem chamado. Software fora do catálogo exige uma requisição com aprovação do gestor.",
    },
    {
      id: "kb-equipamento",
      title: "Solicitar equipamento (monitor, teclado, headset)",
      category: "Hardware",
      body: "Abra uma requisição informando o equipamento e a justificativa. O gestor aprova e a entrega leva até 5 dias úteis. Equipamento para home office exige o termo de responsabilidade assinado.",
    },
  ]);

  type T = typeof tickets.$inferInsert;
  const t = (x: Omit<T, "createdAt" | "updatedAt" | "resolvedAt" | "affected"> & {
    createdAgo: number;
    updatedAgo: number;
    resolvedAgo?: number;
    affected?: string;
  }): T => ({
    id: x.id,
    type: x.type,
    title: x.title,
    description: x.description,
    category: x.category,
    subcategory: x.subcategory ?? null,
    priority: x.priority,
    status: x.status,
    affected: x.affected ?? "self",
    requesterId: x.requesterId,
    createdAt: now - x.createdAgo,
    updatedAt: now - x.updatedAgo,
    resolvedAt: x.resolvedAgo === undefined ? null : now - x.resolvedAgo,
  });

  await db.insert(tickets).values([
    // Ana: os chamados que aparecem no protótipo
    t({
      id: "INC-20311",
      type: "INC",
      title: "Notebook lento após atualização do Windows",
      description:
        "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
      category: "Hardware",
      subcategory: "Notebook",
      priority: "Média",
      status: "Aguardando analista",
      requesterId: "ana.souza",
      createdAgo: 15 * D,
      updatedAgo: 6 * D, // vencido: média = 3 dias úteis
    }),
    t({
      id: "INC-20298",
      type: "INC",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "Perdi o acesso à pasta Financeiro depois da troca de equipe.",
      category: "Acesso",
      priority: "Média",
      status: "Em andamento",
      requesterId: "ana.souza",
      createdAgo: 17 * D,
      updatedAgo: 3 * H,
    }),
    t({
      id: "REQ-10442",
      type: "REQ",
      title: "Segundo monitor para home office",
      description: "Solicito um segundo monitor para trabalhar de casa.",
      category: "Hardware",
      priority: "Baixa",
      status: "Aprovado",
      requesterId: "ana.souza",
      createdAgo: 22 * D,
      updatedAgo: 2 * D,
    }),
    t({
      id: "INC-19877",
      type: "INC",
      title: "Outlook não sincroniza no celular",
      description: "O e-mail corporativo parou de sincronizar no celular.",
      category: "E-mail",
      priority: "Média",
      status: "Resolvido",
      requesterId: "ana.souza",
      createdAgo: 60 * D,
      updatedAgo: 59 * D,
      resolvedAgo: 59 * D, // fora da janela de 7 dias: não pode reabrir
    }),
    t({
      id: "INC-19410",
      type: "INC",
      title: "Troca de senha da rede",
      description: "Preciso trocar a senha da rede, que expirou.",
      category: "Acesso",
      priority: "Baixa",
      status: "Resolvido",
      requesterId: "ana.souza",
      createdAgo: 113 * D,
      updatedAgo: 112 * D,
      resolvedAgo: 112 * D,
    }),

    // Outros funcionários: privacidade e cenários variados
    t({
      id: "INC-20460",
      type: "INC",
      title: "VPN não conecta",
      description: "A VPN falha ao conectar em casa, aparece timeout.",
      category: "Rede e VPN",
      priority: "Alta",
      status: "Aberto",
      requesterId: "carla.mendes",
      createdAgo: 4 * H,
      updatedAgo: 2 * H,
    }),
    t({
      id: "INC-20455",
      type: "INC",
      title: "Acesso ao SAP negado",
      description: "Não consigo entrar no SAP, aparece permissão negada.",
      category: "Acesso",
      priority: "Alta",
      status: "Aberto",
      requesterId: "carla.mendes",
      createdAgo: 5 * H,
      updatedAgo: 3 * H,
    }),
    t({
      id: "INC-20470",
      type: "INC",
      title: "Impressora do 2º andar sem conexão",
      description: "A impressora IMP-2B não aparece na lista.",
      category: "Hardware",
      priority: "Média",
      status: "Em andamento",
      requesterId: "bruno.tavares",
      createdAgo: 1 * D,
      updatedAgo: 6 * H,
    }),
    t({
      id: "INC-20120",
      type: "INC",
      title: "Teams trava durante reuniões",
      description: "O Teams congela quando compartilho a tela.",
      category: "Software",
      priority: "Alta",
      status: "Aberto",
      requesterId: "diego.ramos",
      createdAgo: 3 * D,
      updatedAgo: 2 * D, // vencido: alta = 4 horas úteis
    }),
    t({
      id: "INC-20402",
      type: "INC",
      title: "VPN cai a cada 10 minutos",
      description: "A VPN desconecta sozinha a cada 10 minutos, erro 809.",
      category: "Rede e VPN",
      priority: "Alta",
      status: "Resolvido",
      requesterId: "fabio.nunes",
      createdAgo: 6 * D,
      updatedAgo: 3 * D,
      resolvedAgo: 3 * D, // resolvido recentemente: pode reabrir
    }),
    t({
      id: "REQ-10450",
      type: "REQ",
      title: "Licença do Figma",
      description: "Solicito licença do Figma para o time de marketing.",
      category: "Software",
      priority: "Baixa",
      status: "Aberto",
      requesterId: "elisa.prado",
      createdAgo: 2 * D,
      updatedAgo: 2 * D,
    }),
  ]);

  // Conversas de exemplo para o console do analista não começar vazio.
  const MIN = 60 * 1000;
  type Conv = typeof conversations.$inferInsert;
  const conv = (
    id: string,
    userId: string,
    state: NonNullable<Conv["state"]>,
    agoMin: number,
    extra: Partial<Conv> = {},
  ): Conv => ({
    id,
    userId,
    state,
    analystId: null,
    handoffSummary: null,
    handoffReason: null,
    handoffAt: null,
    confidence: null,
    userMessageCount: 2,
    createdAt: now - (agoMin + 10) * MIN,
    updatedAt: now - agoMin * MIN,
    ...extra,
  });
  const msg = (
    conversationId: string,
    role: "user" | "agent" | "system",
    content: string,
    agoMin: number,
  ) => ({
    id: crypto.randomUUID(),
    conversationId,
    role,
    content,
    parts: null,
    createdAt: now - agoMin * MIN,
  });

  await db.insert(conversations).values([
    conv("seed-carla", "carla.mendes", "waiting_analyst", 25, {
      handoffReason: "user_request",
      handoffAt: now - 25 * MIN,
      handoffSummary:
        "Carla (Comercial) não consegue entrar no SAP (permissão negada; chamado INC-20455 já aberto) e precisa do acesso ainda hoje. Pediu para falar com um analista.",
    }),
    conv("seed-elisa", "elisa.prado", "waiting_analyst", 14, {
      handoffReason: "low_confidence",
      confidence: 41,
      handoffAt: now - 14 * MIN,
      handoffSummary:
        "Elisa (Marketing) quer usar o tablet pessoal na rede interna do escritório. Não há artigo na central de ajuda nem regra clara sobre dispositivos pessoais; o agent preferiu encaminhar.",
    }),
    conv("seed-diego", "diego.ramos", "agent", 3),
    conv("seed-fabio", "fabio.nunes", "closed", 60 * 20),
  ]);
  await db.insert(messages).values([
    msg("seed-carla", "user", "Preciso de acesso ao SAP ainda hoje", 27),
    msg(
      "seed-carla",
      "agent",
      "Vi que você já tem o chamado INC-20455 aberto sobre acesso ao SAP. Como você precisa do acesso ainda hoje, quer que eu chame um analista?",
      26,
    ),
    msg("seed-carla", "user", "Quero sim, por favor", 25),
    msg("seed-carla", "system", "Transferida para Suporte N1", 25),
    msg("seed-elisa", "user", "Posso usar meu tablet pessoal na rede interna do escritório?", 16),
    msg(
      "seed-elisa",
      "agent",
      "Não encontrei uma regra na central de ajuda sobre dispositivos pessoais. Prefiro não arriscar uma resposta errada e vou chamar um analista.",
      15,
    ),
    msg("seed-elisa", "system", "Transferida para Suporte N1", 14),
    msg("seed-diego", "user", "O Teams ainda trava quando eu compartilho a tela", 4),
    msg(
      "seed-diego",
      "agent",
      "Você já tem o chamado INC-20120 sobre isso. Quer que eu acrescente essa informação a ele?",
      3,
    ),
    msg("seed-fabio", "user", "Isso resolveu, obrigado!", 60 * 20),
  ]);

  console.log(
    `Seed concluído. Usuários de teste: ana.souza@nexo.com.br e rafael.lima@nexo.com.br (senha: ${SEED_PASSWORD}).`,
  );
}

// Roda sozinho com `npm run db:seed`; quando importado (ex.: evals) só expõe runSeed.
if (require.main === module) {
  runSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
