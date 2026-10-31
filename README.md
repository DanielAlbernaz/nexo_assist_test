# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema num chat e o agent decide se **responde uma dúvida** (central de ajuda), **consulta ou atualiza um chamado**, **abre um chamado novo** ou **chama um analista**. Um console separado permite que o analista assuma, devolva e encerre conversas.

Stack: **Next.js 16 (App Router) · TypeScript estrito · Mastra · Gemini (Google AI Studio) · Drizzle + SQLite/Turso · Tailwind · Vitest**.

## Como rodar

Requisitos: Node 20+ (testado no 24) e uma chave do [Google AI Studio](https://aistudio.google.com/apikey) (gratuita).

```bash
npm install
cp .env.example .env.local     # preencha GOOGLE_GENERATIVE_AI_API_KEY e SESSION_SECRET
npm run db:setup               # cria as tabelas e carrega os dados de exemplo
npm run dev                    # http://localhost:3000
```

`SESSION_SECRET` pode ser gerado com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### Usuários de exemplo (senha `nexo123`, só para desenvolvimento)

| Papel | E-mail | Observação |
|---|---|---|
| Funcionária | `ana.souza@nexo.com.br` | Tem o INC-20311 **vencido**, um chamado em andamento, um aprovado e dois resolvidos há muito tempo |
| Funcionário | `fabio.nunes@nexo.com.br` | Tem um chamado de VPN **resolvido há 3 dias** (pode ser reaberto) |
| Funcionária | `carla.mendes@nexo.com.br` | Tem um chamado de VPN aberto (os outros funcionários **não** podem vê-lo) |
| Funcionário | `diego.ramos@nexo.com.br` | Chamado de prioridade Alta **vencido** |
| Analista N2 | `rafael.lima@nexo.com.br` | Console em `/console` |
| Analista N1 | `julia.costa@nexo.com.br` | Console em `/console` |

O seed também cria 9 artigos de ajuda e algumas conversas para o console não começar vazio. Todas as datas são relativas ao momento do seed.

### Comandos

```bash
npm test                 # testes (Vitest)
npm run typecheck        # tsc --noEmit
npm run lint
npm run db:setup         # recria tabelas e dados de exemplo
npm run agent:smoke -- "mensagem 1" "mensagem 2"   # conversa com o agent real no terminal
npm run evals            # cenários de comportamento do agent contra o modelo real
```

Para simular o legado instável, defina `TICKET_SERVICE_FAILURE_RATE=0.5` (e, se quiser, `TICKET_SERVICE_LATENCY_MS=800`) no `.env.local`.

## Arquitetura

```
 Navegador ──────────────┐
   /login /chat /perfil  │  fetch + SSE (/api/chat)        ┌──────────────────────────┐
   /console (analista)   ├────────────────────────────────►│  Rotas  src/app/api/*    │
                         │  polling 3 s p/ mensagens novas │  sessão, validação, rate │
                         │                                 └───────────┬──────────────┘
                                                                       │
                       ┌───────────────────────────────────────────────┼──────────────────────────┐
                       ▼                                               ▼                          ▼
              src/agent (Mastra)                              src/chat                  src/ticket-service
              instruções + 8 ferramentas  ──── usa ────►      rascunhos, confirmação,   "sistema legado" simulado:
              streaming de passos/texto                       transferência, conversas  latência, indisponibilidade,
                       │                                               │                chamados só do dono
                       └──────────────► src/domain ◄───────────────────┘                          │
                              regras puras e testadas: horário útil, SLA,                         ▼
                              prioridade, duplicidade, reabertura                       SQLite (arquivo) / Turso
```

| Pasta | Responsabilidade |
|---|---|
| `src/domain` | Regras do Anexo A como funções puras (sem I/O, sem modelo): horário útil, prazos, prioridade, duplicidade, reabertura. |
| `src/ticket-service` | O "sistema de chamados legado". É a **única** porta para os dados de chamados, e o agent só a acessa por um cliente com retry. Toda operação exige o dono do chamado. |
| `src/chat` | Conversas, mensagens, rascunhos, confirmação, transferência e busca na central de ajuda. |
| `src/agent` | Instruções, ferramentas Mastra, modelo e execução de um turno com streaming. |
| `src/app/api` | Rotas HTTP finas: autenticação, validação (zod), limites e chamada às camadas acima. |
| `src/components`, `src/app/*` | Interface (login, chat, perfil, console). |

### Como o agent decide o que fazer

A cada mensagem o agent (Mastra, até 8 passos) escolhe entre **oito ferramentas**:

| Ferramenta | Para quê |
|---|---|
| `search_help_center` | Dúvidas e problemas comuns; respeita condições do artigo (ex.: só Windows 10) |
| `list_my_tickets` / `get_ticket` / `present_tickets` | Consultar chamados do próprio funcionário; mostrar card ou lista para escolher |
| `find_duplicates` | Antes de abrir: há chamado aberto (atualizar) ou resolvido há ≤ 7 dias (reabrir) sobre o mesmo problema? |
| `draft_ticket` | Monta o **rascunho** de criação, atualização ou reabertura |
| `offer_choices` | Botões de resposta rápida (ex.: "Quem é afetado?") |
| `request_handoff` | Transfere para um analista (pedido, caso crítico, chamado vencido, falta de segurança) |

Fluxo de abertura: o agent busca ajuda → checa duplicidade → pergunta o que falta (uma pergunta por vez) → monta o rascunho → **o funcionário confirma pelo botão**. Só então o chamado é criado.

### O que o prompt faz e o que o código garante

O prompt orienta conduta e tom. Tudo que **não pode falhar** também está no código:

| Regra | Onde é garantida |
|---|---|
| Só cria/atualiza **depois da confirmação** | `draft_ticket` só grava um rascunho. Criar é `POST /api/drafts/:id/confirm`, acionado pelo clique (ou um "sim" isolado, tratado em `src/chat/intent.ts` sem passar pelo modelo). O modelo não tem ferramenta de criação. |
| **Privacidade**: chamado só para quem o abriu | O usuário vem da sessão (cookie assinado) e entra nas ferramentas por `requestContext`, nunca por argumento do modelo. O serviço filtra por dono e responde "não encontrado" para chamado alheio (não revela existência). Testado. |
| **Prioridade e prazo** | `computePriority` (impacto × urgência) e `slaDeadline`. O modelo só informa fatos: quem é afetado, se bloqueia, se há compromisso hoje. |
| **Sem duplicidade** | Filtro determinístico (`findDuplicateCandidates`) + decisão do agent, sempre mostrada ao funcionário. Confirmar duas vezes o mesmo rascunho não cria dois chamados. |
| **Reabertura ≤ 7 dias** | `canReopen`, checado no rascunho e de novo no serviço. |
| **Transferência** | `request_handoff` muda o estado da conversa para "aguardando atendente"; enquanto não for `agent`, a rota de chat guarda a mensagem e **não chama o modelo**. Chamado **crítico** transfere automaticamente ao confirmar. |
| **Escopo só TI** | Instruções do agent (RH, financeiro e facilities são redirecionados). Esta regra depende do modelo; não há filtro em código. |
| **Sistema legado fora do ar** | Retry com backoff; se persistir, a ferramenta devolve um erro legível e o agent avisa o funcionário. Um rascunho cuja confirmação falha **continua pendente** para tentar de novo. |

### Regras de prazo (decisões minhas)

O Anexo A deixa pontos em aberto. Escolhas, centralizadas em `src/domain/sla.ts` e `business-hours.ts`:

- Horário útil: **segunda a sexta, 8h–18h**, fuso de Brasília, **sem feriados**.
- **Crítica = 1 hora corrida** (há plantão 24h). **Alta = 4 horas úteis**. **Média = 3 dias úteis** e **Baixa = 5 dias úteis**, contando um dia útil como o expediente inteiro (30 h e 50 h úteis).
- Pedido fora do expediente começa a contar na próxima abertura.
- **Vencido** = prazo contado desde a **última atualização** (não desde a abertura), como diz o enunciado ("o prazo vale para a primeira resposta e para cada atualização").
- Nível/prazo da transferência: crítico → N2 em 1 h; vencido → N2 em 2 h úteis; pedido do funcionário ou falta de segurança → N1 em 4 h úteis.
- "Não sei" na pergunta de quem é afetado é tratado como "só eu".

### Transparência

Acima de cada resposta aparecem os passos executados ("consultou seus chamados", "classificou a prioridade (Alta) · consultou o prazo · montou o rascunho"). O link **detalhes** abre, para cada passo, a ferramenta chamada, a entrada, a saída e o tempo. Os passos ficam salvos junto da mensagem, então dá para auditar conversas antigas.

## Modelo e custo

**Gemini Flash-Lite** (`gemini-flash-lite-latest`) via Google AI Studio. Há retry automático e, opcionalmente, um modelo reserva em `LLM_FALLBACK_MODEL`.

- É gratuito para este uso e bom em *tool calling*, que é o que o agent mais faz.
- Durante o desenvolvimento, os modelos flash maiores estavam sobrecarregados ou com cota esgotada no plano gratuito (20 requisições por dia), e o Flash-Lite respondeu de forma estável. Por isso ele é o padrão e o fallback é opcional (`src/agent/model.ts`).
- **Limite do plano gratuito**: o Flash-Lite aceita cerca de 15 requisições por minuto, e cada turno do agent usa de 2 a 4. Com várias pessoas usando a mesma chave ao mesmo tempo, o provedor responde 429; o agent avisa o funcionário e a conversa continua. Para uma demonstração concorrida, ative cobrança no projeto do Google com um teto de gasto baixo.
- O modelo é configurável por `LLM_MODEL`. Trocar de provedor é instalar `@ai-sdk/<provedor>` e ajustar `getModels()`.

Controles de custo: máximo de **30 mensagens por conversa** (visível na interface), no máximo **8 mensagens por minuto por usuário** (contadas no banco, então valem em qualquer instância), **histórico limitado a 16 mensagens** por turno, no máximo **8 passos** por turno e 60 s de timeout. Confirmação e cancelamento ("sim", "cancelar") e os botões do rascunho não chamam o modelo. Prioridade e prazo são calculados em código, sem gastar tokens.

## Segurança

- Chaves só em variáveis de ambiente (`.env.local` está no `.gitignore`; só o `.env.example` é versionado).
- Sessão por cookie `httpOnly`, `sameSite=lax` e `secure` em produção, assinado com HMAC-SHA256 (comparação em tempo constante). "Manter conectado" alonga a validade para 30 dias.
- Senhas com bcrypt; o login gasta o mesmo tempo para e-mail inexistente (não permite enumerar usuários) e limita tentativas.
- Rotas validam entrada com zod e conferem o papel (funcionário × analista).
- Mesmo que o modelo seja induzido a mudar de comportamento, as ferramentas só enxergam o usuário da sessão.

## Testes

`npm test` roda 65 testes:

- **Domínio**: horário útil atravessando fim de semana, prazos, vencimento, prioridade, reabertura, duplicidade.
- **Serviço de chamados**: privacidade, numeração, reabertura, indisponibilidade e retry, em SQLite em memória com o schema real.
- **Chat**: rascunhos, confirmação (inclui "não cria duas vezes", "legado fora do ar mantém pendente" e transferência automática em chamado crítico), privacidade das ferramentas do agent, central de ajuda, sessão assinada e rate limit.

### Evals do agent (modelo real)

`npm run evals` roda 13 cenários de conversa contra o Gemini, num banco SQLite próprio recriado a cada execução, e confere comportamentos que não podem falhar: responder dúvida pela central sem abrir chamado, respeitar a condição do artigo (Windows 10 × 11), montar rascunho com a prioridade certa **sem criar nada antes da confirmação**, perguntar quando o pedido é vago, sinalizar chamado vencido, transferir quando pedem um analista, atualizar o chamado aberto em vez de duplicar, reabrir só dentro de 7 dias, redirecionar assunto de RH, **não revelar chamado de outro funcionário**, resistir a injeção de prompt e tratar caso crítico como prioridade Crítica. No fim ele confere o invariante "nenhum chamado foi criado sem confirmação".

O modelo não é determinístico, então cada cenário tem até 2 tentativas (`EVALS_ATTEMPTS`) e o relatório separa "passou de primeira" de "só na repetição". Última execução: **13 cenários, 11 de primeira, 2 só na repetição, 0 falharam**. Eles não rodam no `npm test` porque gastam cota do modelo e dependem de rede. Filtre por nome com `npm run evals -- vpn`.

Os evals já pegaram dois defeitos reais: o agent transferia um caso crítico sem abrir o chamado e chamava a transferência duas vezes (agora a ferramenta é idempotente e o prompt manda abrir o chamado primeiro).

## Deploy (Vercel + Turso)

1. **Banco**: crie um banco no [Turso](https://turso.tech) e gere um token.
   ```bash
   turso db create nexo-assist
   turso db show nexo-assist --url          # libsql://...
   turso db tokens create nexo-assist
   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run db:setup
   ```
   O mesmo código usa um arquivo SQLite local em desenvolvimento e o Turso em produção (driver libSQL nos dois).
2. **Vercel**: importe o repositório e configure `GOOGLE_GENERATIVE_AI_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN` (e `LLM_MODEL`, se quiser).
3. **Custo**: use uma chave do AI Studio dedicada ao deploy e revogue-a depois da avaliação. Os limites da seção "Modelo e custo" já valem em produção.

Os limites do chat (30 mensagens por conversa e 8 por minuto) são contados no banco e valem em qualquer instância. Só a proteção contra tentativas de login é em memória, por instância.

## Trade-offs e o que faria com mais tempo

- **Sistema de chamados**: é um módulo separado com interface própria, não um serviço HTTP independente. Mantive assim para rodar com poucos comandos; trocar por um cliente HTTP é mudar `src/ticket-service/client.ts`.
- **Tempo real**: o chat usa SSE para a resposta do agent, mas mensagens de analista chegam por *polling* de 3 s. Com mais tempo: SSE/WebSocket também para isso e para a lista do console.
- **Duplicidade e busca na central**: ambas por palavras (Jaccard / sobreposição de termos). Com mais tempo: embeddings, que pegam "VPN caiu" × "sem acesso remoto".
- **Evals**: hoje são 13 cenários de uma única passada por conversa; faltam conversas longas, mais variações de redação e métricas de custo por cenário.
- **Escopo só TI** hoje depende do modelo; um classificador barato antes do agent tornaria isso verificável.
- **Feriados** no cálculo do horário útil, e plantão por equipe.
- **Observabilidade**: os passos ficam no banco; faltam métricas de custo/tokens por conversa e alertas.
- **Autenticação**: senha em seed e cookie próprio atendem ao desafio; em produção seria SSO corporativo.
- **Limite de login** compartilhado (Redis/Upstash) e bloqueio otimista quando dois analistas tentam assumir a mesma conversa.
- **Editar rascunho**: o botão "Editar" pré-preenche o chat para o agent gerar um rascunho novo (que substitui o anterior), em vez de um formulário.

## Uso de IA no desenvolvimento

O código foi escrito com apoio do Claude Code. As decisões de arquitetura estão descritas acima (o que fica no código e o que fica no prompt, confirmação só por ação do usuário, identidade do usuário fora do alcance do modelo, regras de prazo) e as regras estão cobertas por testes.
