# RE9 Finanças — Plano de Melhorias (roadmap para ser a melhor do mercado)

> Gerado em 2026-07-11, após a auditoria e correção de 33 defeitos (ver
> [AUDITORIA-2026-07.md](AUDITORIA-2026-07.md)). O produto hoje é um **front-end completo**
> com dados in-memory (Pinia + seed) e integrações mockadas. Este documento elenca as
> melhorias para transformá-lo no **melhor sistema de gestão financeira para imobiliárias
> e agências de marketing** do Brasil, cada uma com **plano técnico de implementação**.

## Como ler este plano

Cada item traz: **Objetivo** (o valor de negócio), **Plano técnico** (o como, com stack e
arquivos) e **Esforço** (P/M/G). A ordem segue prioridade: primeiro o que destrava produção
(fundação), depois diferenciais competitivos, depois refinamento.

Legenda de esforço: **P** ≈ até 2 dias · **M** ≈ 3–8 dias · **G** ≈ 2+ semanas.

---

## FASE A — Fundação para produção (sem isto, é só protótipo)

### A1. Backend real com Supabase (Postgres + RLS) · Esforço G
**Objetivo:** persistência real, multiusuário, com isolamento total entre empresas — hoje
os dados são clonados do seed e somem no reload.

**Plano técnico:**
- Criar projeto Supabase; versionar migrations SQL (as tabelas já estão desenhadas no design
  spec §4). Habilitar **RLS** em todas as tabelas com policy `company_id = auth.jwt() -> company_ids`.
- Substituir `data/seed.ts` + Pinia como *fonte* por uma camada de dados: `server/api/*`
  (Nitro) OU `@supabase/supabase-js` no cliente com RLS. Recomendado: **camada `server/api`**
  para esconder a service key e centralizar regras.
- Manter os stores Pinia como **cache/estado de UI**, populados por `useAsyncData`/`useFetch`.
  Os getters `company*` continuam, mas passam a ler do estado carregado do backend.
- Migrar o motor de comissões (`stores/finance.ts:generateCommissionForSale`) para uma
  **função no servidor** (Edge Function ou RPC Postgres) para garantir atomicidade
  (comissão + parcela + receber + pagar + splits numa transação).
- Seed vira `supabase/seed.sql` para ambientes de dev.

**Riscos:** reescrita da camada de dados. Mitigar mantendo a **mesma interface dos getters**
para as páginas não mudarem.

### A2. Autenticação e sessão reais · Esforço M
**Objetivo:** hoje login/registro são fictícios (`<VBtn to="/">`). Sem auth não há produto.

**Plano técnico:**
- **Supabase Auth** (email/senha + recuperação por e-mail, já previsto no spec §3.1).
- `stores/auth.ts` com sessão; plugin Nuxt para hidratar sessão no boot.
- Ampliar o `middleware/route-guard.global.ts` (criado nesta auditoria): adicionar
  `middleware/auth.global.ts` que redireciona não-autenticados para `/login`.
- `pages/login.vue`/`register.vue`: ligar os forms ao `signInWithPassword`/`signUp`.
- Carregar `user_company_roles` no login e alimentar `stores/app.ts` (hoje mock).

### A3. Recorrência e agendamentos automáticos (job/cron) · Esforço M
**Objetivo:** contas `recurrence: 'monthly'` e NFS-e `invoiceRule: 'recurring'|'scheduled'`
**não geram nada automaticamente** hoje — só têm o campo.

**Plano técnico:**
- Supabase **pg_cron** (ou Nitro scheduled task) diário que:
  1. gera o próximo lançamento de contas a pagar/receber recorrentes vencidas;
  2. emite NFS-e agendadas (`invoiceScheduledDate == hoje`) e recorrentes
     (`invoiceRecurrenceDay == dia do mês`).
- Tabela `job_runs` para idempotência (não gerar duas vezes no mesmo dia).
- Reaproveitar a lógica de `createInstallmentPayable` para as séries.

### A4. Persistência de anexos/comprovantes · Esforço P
**Objetivo:** hoje `proofUrl`/`documents` são apenas strings de URL digitadas à mão.

**Plano técnico:** **Supabase Storage** com bucket por empresa e RLS; componente de upload
reutilizável (`components/FileUpload.vue`) devolvendo a URL assinada; trocar os `VTextField`
de "URL do comprovante" em `contas-a-pagar`/`contas-a-receber`/`colaboradores` por ele.

### A5. Audit log · Esforço P
**Objetivo:** rastreabilidade (quem/o quê/quando), exigida pelo spec §3.1 e por compliance.

**Plano técnico:** trigger Postgres `AFTER INSERT/UPDATE/DELETE` gravando em `audit_log`
(old/new como jsonb) OU wrapper nas Edge Functions. Tela de consulta em `pages/auditoria.vue`
filtrável por entidade/usuário/período (reaproveita `AppNotification`-like UI).

---

## FASE B — Integrações que são o diferencial (imobiliária + agência)

### B1. Emissão real de NFS-e — SEFIN Fortaleza (ABRASF/SOAP) · Esforço G
**Objetivo:** hoje `issueInvoice` é mock (gera número fake). É o maior diferencial fiscal.

**Plano técnico:**
- Edge Function/serviço Node dedicado (fora do browser — exige certificado): monta o XML
  ABRASF, **assina com o certificado A1** (`.pfx`) via `node-forge`/`xml-crypto`, envia por
  **SOAP** ao webservice da SEFIN, trata retorno (número, código de verificação) e erros.
- Certificado A1 **criptografado (AES-256)** no banco, um por empresa (campo já previsto);
  nunca no cliente.
- Gerar **DANFSE (PDF)** e armazenar XML+PDF no Storage; retry automático (até 3x) em timeout.
- Substituir a simulação em `stores/finance.ts:issueInvoice`/`createInvoiceFromReceivable`
  por chamadas à função; manter os estados `pending/issued/error/cancelled` já modelados.
- **Download em lote (ZIP)** de XMLs+PDFs por período (spec §3.14) — `jszip` no servidor.

### B2. Notificações reais — WhatsApp (Evolution API) + E-mail (SMTP) · Esforço M
**Objetivo:** o `notify()` só grava no painel; canais `whatsapp`/`email` não enviam nada.

**Plano técnico:**
- Serviço `server/utils/notifier.ts` com adapters `whatsapp` (Evolution API já na infra RE9)
  e `email` (SMTP Hostgator). Templates por `NotificationType` (spec §3.16).
- Motor de regras server-side lê `notification_rules` (ativa? canais? antecedência?) — hoje a
  UI edita as regras mas nada as consome. Disparar no cron (A3) e em eventos (venda, baixa,
  erro de NF).
- Rate limiting para não bloquear o número de WhatsApp.

### B3. Importador inteligente com Claude API · Esforço M
**Objetivo:** o wizard existe mas é 100% fake (mapeamento e validação estáticos).

**Plano técnico:**
- Upload real (`.xlsx` via `xlsx`/SheetJS, `.csv` via `papaparse`) → envio do **cabeçalho +
  amostra** para a **Claude API** (`claude-sonnet-5`) pedindo o mapeamento coluna→campo em
  JSON estruturado (tool use / output schema).
- Validação real: CPF/CNPJ (dígitos verificadores), datas, valores, duplicatas.
- Importação transacional por lote com relatório final (importados/erros/ignorados) e log.
- Reusar o `pages/importador.vue` (já corrigido nesta auditoria para remapear ao trocar módulo).

---

## FASE C — Profundidade de produto (o que faz vencer a concorrência)

### C1. Dashboard consolidado do Super Admin (multiempresa) · Esforço M
**Objetivo:** spec §3.2 pede visão somada e comparativo entre empresas; hoje só há visão por
empresa. É o painel que o dono (Reno) mais quer.

**Plano técnico:** novo `composables/useConsolidatedMetrics.ts` que agrega sobre
`availableCompanies` (não só a atual); página `pages/dashboard-consolidado.vue` visível só a
super_admin, com comparativo RE9 Imóveis × RE9 Online e totais do grupo.

### C2. Motor de comissões completo · Esforço M
**Objetivo:** hoje gera 1 parcela e splits fixos (imobiliária/corretor). O spec §3.12 prevê
**múltiplas parcelas**, **splits adicionais** (gerente, captador) e **repasse parcela-a-parcela**.

**Plano técnico:**
- `generateCommissionForSale`: aceitar plano de parcelas (n, datas, valores) e uma lista de
  splits configurável por venda (tipos `manager`/`captador` já existem no enum).
- Repasse vinculado por parcela recebida (gerar a conta a pagar do corretor só quando a parcela
  correspondente entra) — hoje é vínculo único.
- UI em `vendas.vue`/`comissoes.vue` para configurar parcelas e splits na criação.

### C3. Métricas de conversão do funil · Esforço P
**Objetivo:** spec §3.11 pede taxa de conversão por estágio e tempo médio por estágio, por
corretor e por empreendimento. Hoje o funil só mostra contagem.

**Plano técnico:** usar `funnelHistory` (já gravado em `moveFunnelCard`) para calcular tempo
médio por estágio e taxa de avanço; gráfico de funil (ApexCharts `funnel`) em `pages/funil.vue`
e no portal do corretor.

### C4. Balancete + exportações PDF/XLSX · Esforço M
**Objetivo:** relatórios hoje exportam só CSV; spec §3.15 pede **PDF e Excel** e um
**Balancete** (saldos por conta) que ainda não existe.

**Plano técnico:** `pages/relatorios.vue` — adicionar aba Balancete (agrega lançamentos por
conta do plano hierárquico). Exportação **XLSX** via SheetJS e **PDF** via `@vue-pdf`/servidor
(Puppeteer) com layout contábil. CSV já foi corrigido nesta auditoria (decimal pt-BR).

### C5. Validação forte de documentos (CPF/CNPJ) · Esforço P
**Objetivo:** hoje só há máscara de exibição (`formatDocument`); aceita documentos inválidos.

**Plano técnico:** adicionar `cpfRule`/`cnpjRule` em `utils/validators.ts` (dígitos
verificadores) e aplicá-las nos cadastros de fornecedores/colaboradores/clientes.

### C6. Conciliação bancária / OFX (open finance) · Esforço G
**Objetivo:** diferencial forte — importar extrato (OFX/Pluggy/Belvo) e **conciliar** com
contas a pagar/receber automaticamente.

**Plano técnico:** integração com agregador (Pluggy/Belvo) ou upload OFX; tela de conciliação
que sugere matches (valor+data+descrição) e cria `transactions` vinculadas; baixa automática.

---

## FASE D — Qualidade, escala e confiança

### D1. Testes automatizados · Esforço M
**Objetivo:** proteger a lógica financeira (comissões, projeções, DRE) contra regressões — a
auditoria encontrou vários bugs nessas áreas.

**Plano técnico:** **Vitest** para unit (motor de comissões, `useFinanceMetrics`, formatadores,
validadores) com casos derivados do seed; **Playwright** para e2e dos fluxos críticos
(cadastrar venda → comissão → receber → repasse → NFS-e). CI no GitHub Actions.

### D2. CI/CD + deploy (Docker/Traefik na VPS) · Esforço M
**Objetivo:** spec §8 já define o alvo (Hostinger VPS, Traefik, GHCR). Automatizar.

**Plano técnico:** `Dockerfile` multi-stage (build Nuxt → runtime Node do `.output`);
`docker-compose.yml` com Traefik + Let's Encrypt; GitHub Actions build→push GHCR→deploy SSH;
health checks. Domínio `financeiro.re9imob.com.br`.

### D3. Observabilidade e erros · Esforço P
**Objetivo:** saber quando a SEFIN/WhatsApp/SMTP falham em produção.

**Plano técnico:** Sentry (front + server) para exceções; log estruturado nas Edge Functions;
alerta de falha crítica via o próprio canal WhatsApp (dogfooding do B2).

### D4. Performance e escala de UI · Esforço P
**Objetivo:** as tabelas hoje carregam tudo em memória; com milhares de lançamentos, trava.

**Plano técnico:** paginação/filtros **server-side** nas `VDataTable` (via `server/api` com
`range`), virtualização onde couber, e índices Postgres em `company_id`, `due_date`, `status`.

### D5. Acessibilidade, mobile do corretor e PWA · Esforço M
**Objetivo:** corretores usam no celular (spec §7 pede responsivo). Elevar a barra.

**Plano técnico:** auditoria a11y (foco, contraste, labels), revisar o Portal do Corretor para
mobile-first, e habilitar **PWA** (`@vite-pwa/nuxt`) para uso offline básico e atalho na tela.

---

## Sequenciamento sugerido

1. **A1 + A2** (backend + auth) — destrava tudo.
2. **A3 + A4 + A5** (recorrência, anexos, auditoria) — operação confiável.
3. **B1** (NFS-e real) — maior diferencial fiscal.
4. **B2 + B3** (notificações + importador) — automação e onboarding.
5. **C1–C5** — profundidade competitiva (consolidado, comissões, funil, relatórios, validação).
6. **D1–D5** — qualidade e escala em paralelo desde o início (testes já na Fase A).
7. **C6** (open finance) — aposta de diferenciação de médio prazo.

## Princípio de execução

Preservar a **interface dos getters/stores** ao trocar o mock por backend, para que as ~20
páginas já prontas (e agora corrigidas) continuem funcionando sem reescrita. Cada fase deve
sair com testes (D1) e atrás de flags quando tocar dinheiro real (NFS-e, repasses).
