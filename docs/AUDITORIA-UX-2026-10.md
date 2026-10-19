# RE9 Finanças — Auditoria completa de UX (outubro/2026)

> **Escopo:** toda a aplicação — shell e navegação, Dashboard e Consolidado, Contas a Pagar/Receber, Fluxo de Caixa, Importador, Notas Fiscais, Comercial (Vendas, Comissões, Funil, Empreendimentos, Portal do Corretor), Cadastros, Relatórios, Plano de Contas, Centros de Custo, Notificações, Histórico e Configurações.
> **Método:** inspeção heurística feita na leitura do código-fonte (Nielsen + WCAG 2.2 AA + boas práticas de produtos financeiros como Conta Azul, Nibo, QuickBooks, Xero e Ramp). Todos os achados citam `arquivo:linha`. Os achados críticos foram conferidos manualmente no código.
> **Base:** branch `codex/development-defaults-quick-create`, incluindo as alterações não commitadas em `pages/contas-a-pagar.vue`.
> **Limitações:** não houve teste com usuários reais nem análise de dados de uso, e o app não foi navegado autenticado. Os itens que dependem do backend (RLS, limite de linhas do PostgREST) estão marcados como "confirmar".
> **Auditorias anteriores:** `AUDITORIA-FRONTEND-2026-07.md` tratou de responsividade pontual e `aria-label`. Este documento não repete os itens já corrigidos lá.

---

## 1. Sumário executivo

### Veredito

A base é sólida, acima da média de sistemas internos: permissões em camadas, livro-caixa auditável com estornos (sem apagar), formatação pt-BR centralizada, overrides de responsividade bem pensados e um atalho global "+". **O problema central não é visual. É de confiança.** Hoje o usuário não pode confiar plenamente nos números que vê, por três motivos:

1. **Alguns números estão objetivamente errados.** O parcelamento multiplica o valor total pelo número de parcelas, o importador corrompe valores e datas, a hora de recebimento é gravada em UTC e o KPI de faturamento recorrente sai inflado.
2. **Números que deveriam ser iguais divergem entre telas.** Exemplos: card "Vencidas" × lista filtrada, projeção do Dashboard × Fluxo de Caixa, DRE × Balancete × Centros de Custo.
3. **O sistema mostra "R$ 0,00" e "Tudo em ordem" enquanto ainda está carregando ou quando falhou.**

Em software financeiro, confiança é a experiência. Depois dela vêm **eficiência operacional** (baixa em lote, totais, filtros que persistem, campo de moeda decente) e **segurança contra erro** (ações financeiras e fiscais de um clique, empresa ativa pouco visível).

### Placar por dimensão (0–10)

| Dimensão | Nota | Comentário |
|---|---|---|
| Correção e coerência dos números | **4** | Bugs que geram dados errados e regras duplicadas que divergem |
| Feedback do sistema (loading, erro, sucesso) | **4** | Sem skeletons, erros escondidos atrás de diálogos, snackbars inconsistentes |
| Prevenção de erros e ações destrutivas | **5** | Exclusão bem explicada, mas baixa, repasse e emissão de NFS-e em um clique |
| Eficiência operacional (tarefas diárias) | **5** | Sem ações em lote, sem totais, filtros que se perdem, `type="number"` para dinheiro |
| Arquitetura de informação e navegação | **7** | Agrupamento bom; faltam busca global, drill-down e links entre entidades |
| Contexto multiempresa | **5** | Empresa ativa não persiste, fica invisível no celular e não aparece nos diálogos |
| Visualização de dados e dashboards | **5** | KPIs duplicados, sem comparação, gráficos com escala ruim, sem drill-down |
| Formulários | **5** | Sem máscaras, sem marcação de obrigatório, Enter não envia, validação só por snackbar |
| Mobile | **6** | Tabelas viram cards (bom), mas cards sem prioridade, funil sem toque e diálogos longos |
| Acessibilidade (WCAG 2.2 AA) | **5** | Contraste das cores semânticas abaixo de 4,5:1, foco removido no menu, sem `lang` |
| Consistência entre módulos | **5** | Pagar ≠ Receber em quase tudo: baixa, estorno, snackbar, recorrência, cancelamento |

### As 12 ações de maior retorno

| # | Ação | Por quê | Esforço |
|---|---|---|---|
| 1 | Corrigir o parcelamento (total ÷ N, com prévia) — **F-01** | Hoje cria R$ 9.000 de dívida para uma conta de R$ 3.000 | P |
| 2 | Corrigir o importador (número e data) — **I-01, I-02** | Valores ×100 e datas −1 dia entram sem aviso | P |
| 3 | Usar data e hora local em recebimento e emissão — **F-02** | Recebimentos caem no dia ou no mês errado | P |
| 4 | Skeleton e estado de erro no lugar de "R$ 0,00 / Tudo em ordem" — **G-01** | Evita tranquilidade falsa ou pânico | M |
| 5 | Um só **diálogo de baixa** (Pagar, Receber, Comissão e Repasse) com data, conta, forma, juros, desconto e comprovante — **F-05, C-01, C-02** | Elimina baixa de um clique, unifica o comportamento e permite registrar retroativos | M |
| 6 | Seleção múltipla, **baixa em lote** e rodapé de totais — **F-06, F-07** | É a tarefa nº 1 do fechamento mensal | M |
| 7 | Componente **MoneyField** com máscara BRL em todo o app — **G-08** | Erro de valor é o mais caro em sistema financeiro | P |
| 8 | Erros dentro do diálogo e **useNotify** global — **G-05, G-06** | Hoje as falhas ficam invisíveis em 6 telas | P |
| 9 | Empresa ativa persistente, visível no celular e citada nos diálogos — **G-03, G-04** | Evita lançar na empresa errada | P |
| 10 | Uma **fonte única de métricas** e KPIs clicáveis que levam à lista filtrada — **D-02, D-03, D-04** | Números coerentes e ação a partir do alerta | M |
| 11 | Restringir o que o corretor vê e edita — **G-02, C-05, C-09** | Hoje ele vê o caixa e a margem da empresa e altera a divisão da comissão | P |
| 12 | Confirmação e revisão antes de emitir NFS-e; motivo obrigatório no cancelamento — **N-01** | Documento fiscal tem reversão burocrática | P |

Esforço: **P** ≤ 1 dia · **M** 2–5 dias · **G** > 1 semana.

---

## 2. Princípios que orientam as recomendações

1. **O número é sagrado.** Todo valor exibido precisa ter uma única regra de cálculo, um rótulo que diga o que é ("no período X", "em aberto", "bruto") e um caminho de um clique até os lançamentos que o compõem.
2. **Nunca mostrar zero quando o certo é "não sei ainda".** Carregando, falhou e vazio são três estados diferentes e cada um tem sua tela.
3. **Dinheiro sai e entra só com intenção explícita.** Toda movimentação de caixa ou ação fiscal passa por um diálogo que mostra valor, data, conta e empresa.
4. **Contexto sempre visível.** Empresa ativa, período e filtros aplicados ficam visíveis o tempo todo e persistem (URL e cookie).
5. **Lote antes de linha.** O fechamento mensal é feito em lotes: selecionar, ver o total e agir.
6. **Simetria.** Pagar e Receber são espelhos: mesmos componentes, mesmos fluxos, mesmas palavras.
7. **O corretor é um usuário mobile e de autosserviço.** O portal dele precisa funcionar com o polegar e mostrar só o que é dele.

---

## 3. Problemas sistêmicos (transversais)

Estes temas aparecem em vários módulos. Resolver na raiz, com um componente ou composable compartilhado, vale mais do que corrigir tela por tela.

### G-01 · Carregamento e falha se confundem com "vazio" — **Crítico**
- **Evidência:** `app.vue:24-29` (só uma barra fina enquanto `isHydrating`). Não existe `VSkeletonLoader` no projeto. Nenhuma `VDataTable` usa `:loading`. `pages/dashboard.vue:47-48` mostra "Tudo em ordem" quando a lista de alertas está vazia. `NavbarNotifications.vue:99-104` mostra "Nenhuma notificação". O saldo aparece como "R$ 0,00".
- **Impacto:** o dono vê caixa zerado ou "Tudo em ordem" antes dos dados chegarem, ou depois de uma falha.
- **Recomendação:**
  - Criar o composable `useDataState()`, que devolve `loading | error | empty | ready` a partir de `app.isHydrating`/`app.dataError`.
  - Skeleton em KpiCard, CashBalanceBadge, gráficos (`VueApexCharts.server.vue` com placeholder de altura fixa, o que também elimina o salto de layout) e tabelas.
  - Alertas positivos ("Tudo em ordem") só depois de uma hidratação bem-sucedida.
  - Estados vazios com chamada para ação ("Cadastrar primeira conta" / "Importar planilha").

### G-02 · Corretor vê informação sensível da empresa — **Alto**
- **Evidência:**
  - `DefaultLayoutWithVerticalNav.vue:37`: o `CashBalanceBadge` aparece sem checar perfil (o QuickAdd ao lado checa).
  - `NavItems.vue:15-21` e `middleware/route-guard.global.ts`: `/dashboard` não está bloqueado para o corretor.
  - `pages/login.vue:27` sempre redireciona para `/dashboard`.
  - `portal-corretor.vue:274` mostra `com.totalAmount`, a comissão total da imobiliária (ver C-09).
- **Recomendação:** esconder o badge para o corretor; levar o corretor direto ao Portal (no menu, no guard e no pós-login). **Confirmar com o negócio** se o perfil Visualizador deve ver o caixa.

### G-03 · Empresa ativa não persiste e o contexto não é revalidado ao trocar — **Alto**
- **Evidência:** `stores/app.ts:85-87,99-103`: `setCompany` não persiste e `hydrate` volta para `accessible[0]` a cada recarga. Nada reaplica o route guard quando a empresa muda.
- **Impacto:** depois de um F5, o usuário passa a lançar na primeira empresa sem saber. Quem está em `/vendas` e troca para a Agência continua numa página comercial.
- **Recomendação:** `useCookie('re9_company')`; ao trocar, mostrar o snackbar "Agora você está em **RE9 Online**" e navegar para `route.fullPath` com `replace`, o que reavalia o guard.

### G-04 · No celular e nos diálogos não se sabe em qual empresa se está — **Alto**
- **Evidência:** `CompanySelector.vue:15-24`: em `xs` mostra só um ícone. Os diálogos de criação (`QuickAddMenu.vue:160-163`) e o convite de usuário (`configuracoes.vue:697`) não citam a empresa.
- **Recomendação:**
  - Faixa fina de 3–4 px com a cor da empresa (`logoColor`) no topo da navbar e um chip com a sigla no `xs`. É o padrão do Slack e do Xero para multi-organização.
  - Subtítulo "Empresa: RE9 Imóveis" em todo diálogo que grava dados.

### G-05 · Erros aparecem atrás do diálogo ou longe da ação — **Alto**
- **Evidência:** `comissoes.vue:707-713` (erro na página, botões no `VDialog:432`), `funil.vue:172-178` (diálogo `persistent` por cima), `fornecedores.vue:113-119`, `colaboradores.vue:116-122`, `vendas.vue:1010-1018`.
- **Impacto:** a falha fica invisível; o usuário acha que deu certo ou clica de novo.
- **Recomendação:** padrão único: o erro aparece **dentro** do diálogo, no topo do conteúdo, com `role="alert"`/`aria-live`, e a tela rola até ele; o botão principal fica com `:loading` durante a requisição.

### G-06 · Feedback de sucesso inconsistente — **Médio**
- **Evidência:** há VSnackbar só em Contas a Pagar (3 s, topo à direita, `contas-a-pagar.vue:329-336`), em Contas a Receber (5 s, embaixo, `contas-a-receber.vue:1131-1137`) e no QuickAdd. Nenhuma página comercial confirma sucesso.
- **Recomendação:** `useNotify()` global com um único VSnackbar no `app.vue`:
  - sucesso: 4 s, com ação opcional "Desfazer" ou "Ver";
  - erro: fica até o usuário fechar;
  - posição fixa (embaixo, centralizado no celular).

### G-07 · O ConfirmDialog é frágil para ações assíncronas — **Médio**
- **Evidência:**
  - `components/ConfirmDialog.vue:44-49` (`emit('confirm'); close()`): não tem loading, não é `persistent` e não tem lugar para mostrar erro.
  - `contas-a-pagar.vue:846-853` põe lado a lado os botões "Cancelar" (fechar) e "Cancelar conta" (executar).
- **Recomendação:**
  - Criar o **ConfirmDialog v2** com as props `loading`, `error` e `cancelText`. Ele só fecha quando o handler resolver.
  - Quando a ação é destrutiva, o foco começa em "Voltar".
  - Quando a ação é um cancelamento, o botão de fechar passa a ser "Manter conta".
  - Para ações em massa ou irreversíveis (restaurar histórico), exigir que o usuário digite uma palavra de confirmação.

### G-08 · Dinheiro digitado em `type="number"` — **Alto**
- **Evidência:**
  - Em finanças: `contas-a-pagar.vue:668-674, 809-818`, `contas-a-receber.vue:747-753, 999-1006`, `QuickAddMenu.vue:192-198, 256-262, 372-377`.
  - No comercial: VGV em `vendas.vue:568-574`.
  - Nas configurações: ISS em `configuracoes.vue:489-494`.
- **Impacto:**
  - A vírgula decimal se comporta de forma diferente em cada navegador.
  - A roda do mouse altera o valor sem o usuário perceber.
  - Sem separador de milhar, R$ 1.250.000 vira um campo cru, e é fácil digitar um zero a mais ou a menos.
- **Recomendação:** componente **`MoneyField`**:
  - máscara pt-BR que digita da direita para a esquerda, em centavos;
  - `inputmode="decimal"`, para abrir o teclado numérico no celular;
  - armazenamento em centavos e bloqueio da roda do mouse.
  - Variantes `PercentField` e `DocumentField` (CPF/CNPJ com `documentRule`) e `PhoneField`.

### G-09 · Formulários sem convenções — **Médio**
- **Evidência:**
  - Nenhum rótulo marca o que é obrigatório.
  - Os botões Salvar ficam fora do `VForm` e não são `type="submit"`: Enter não envia (pagar, receber, plano de contas, centros, funil).
  - Campos com `:rules` são checados por snackbar antes de `validate()` (`contas-a-pagar.vue:146-150`, `contas-a-receber.vue:171-188`).
  - "Cancelar" descarta tudo sem perguntar, mesmo em diálogo `persistent` (`QuickAddMenu.vue:454`).
- **Recomendação:** padrão `AppFormDialog`:
  - `*` nos obrigatórios e a legenda "* obrigatório";
  - submit nativo e Ctrl+Enter para salvar;
  - `validate()` primeiro, rolando até o primeiro erro;
  - pergunta "Descartar alterações?" quando o formulário foi alterado;
  - opção "Salvar e criar outro";
  - `scrollable` com as ações fixas no rodapé e `fullscreen` no `xs`.

### G-10 · Números sem caminho: nada é clicável — **Alto**
- **Evidência:**
  - KPIs: `KpiCard.vue:16` não tem `to`.
  - Alertas: `dashboard.vue:162-188`.
  - Linhas de DRE, balancete e centros: `relatorios.vue:377-385, 492-507, 682-704`.
  - Notificações: `types/finance.ts:470-482` não tem destino.
  - Consolidado: `dashboard-consolidado.vue:112-126`.
  - Venda → comissão → recebível: `vendas.vue:806-1008`.
- **Recomendação:**
  - Prop `to` no KpiCard.
  - As listas passam a ler os filtros de `route.query` (`?status=overdue&due=7d`).
  - Drawer de lançamentos ao clicar numa linha de relatório.
  - `targetRoute` nas notificações.
  - Links cruzados Venda ↔ Comissão ↔ Recebível ↔ Repasse ↔ NFS-e.

### G-11 · Filtros, abas e período não persistem — **Médio**
- **Evidência:** são `ref`s locais em `contas-a-pagar.vue:12-15`, `contas-a-receber.vue:12-15` e `relatorios.vue:16-19`. `configuracoes.vue:12` lê `?tab` uma vez e nunca grava.
- **Recomendação:** composable `useQueryState()`, que sincroniza com a URL (dá para compartilhar, sobrevive ao F5 e ao voltar). Numa segunda fase, visões salvas ("Vencidos > 30 dias", "Folha").

### G-12 · Seleção de período fragmentada — **Médio**
- **Evidência:** `MonthFilter` (só um mês, por vencimento) em Pagar e Receber; `PeriodRangeFilter` em Vendas e Comissões; dois campos de data soltos em Relatórios (`relatorios.vue:293-308`); nenhum controle no Dashboard nem em Centros de Custo. `PeriodRangeFilter.vue:26-32` aceita início depois do fim.
- **Recomendação:** um único **`PeriodPicker`**:
  - atalhos: Hoje, 7 dias, Este mês, Mês anterior, Trimestre, Ano, Personalizado;
  - seletor do tipo de data: vencimento, competência ou pagamento;
  - validação `de ≤ até`;
  - período visível no subtítulo da página.

### G-13 · Cores semânticas com contraste abaixo do mínimo — **Alto (a11y)**
- **Evidência:** `plugins/vuetify/theme.ts:16-27`. Contraste do branco sobre cada cor:

  | Cor | Contraste |
  |---|---|
  | success `#56CA00` | ≈ 2,2:1 |
  | warning `#FFB400` | ≈ 1,7:1 |
  | info `#16B1FF` | ≈ 2,5:1 |
  | error `#FF4C51` | ≈ 3,2:1 |

  Rótulos de eixos e títulos de seção usam `disabled-opacity` 0,4 (`theme.ts:61,131`; `_vertical-nav.scss:63`). Receita e despesa são diferenciadas só pelo par verde e vermelho (problema para daltônicos).
- **Recomendação:**
  - Escurecer os tons sólidos (ex.: success `#2E7D00`, warning `#9A6400` ou `on-warning` escuro, info `#0A6FB0`, error `#C62828`) e manter os tons claros só para os fundos tonais.
  - Texto secundário com `medium-emphasis` (≥ 0,7).
  - Valores sempre com sinal explícito (−/+) ou ícone.
  - Nos gráficos, um par compatível com daltonismo (azul × laranja) ou marcadores e traços diferentes.

### G-14 · Acessibilidade estrutural — **Médio**
- **Evidência:**
  - Falta `lang="pt-BR"` (`nuxt.config.ts:7-17`).
  - O `h1` da página é o logo e os títulos das páginas são `h4` (`AppPageHeader.vue:26`).
  - O contorno de foco foi removido nos links do menu (`@core/scss/base/_vertical-nav.scss:132-134`).
  - O menu do usuário é um `VAvatar` sem `role` nem `tabindex` (`UserProfile.vue:32-40`).
  - O ThemeSwitcher não tem rótulo e o tooltip está em inglês.
  - Faltam `aria-label` em Notas Fiscais (`:329,351,365,379,392`) e em "Dar baixa" (`contas-a-pagar.vue:496`).
  - Os gráficos não têm alternativa textual nem locale pt-BR.
- **Recomendação:**
  - Corrigir cada item acima.
  - Regra de lint `eslint-plugin-vuejs-accessibility` no CI.
  - Locale pt-BR global no ApexCharts, e nos gráficos `role="img"` com `aria-label` resumindo os totais e o botão "ver como tabela".

### G-15 · Tipografia numérica — **Baixo**
- **Evidência:** não há `tabular-nums` no projeto. A fonte Inter é carregada via JS no cliente (`plugins/webfontloader.client.ts:13`), o que causa troca visível de fonte (FOUT).
- **Recomendação:** classe global `.num { font-variant-numeric: tabular-nums }` em valores, colunas monetárias alinhadas à direita, e `@nuxt/fonts` (ou preload) com `font-display: swap`.

### G-16 · Busca global e localização — **Médio**
- **Evidência:** não há busca global nem breadcrumbs (`DefaultLayoutWithVerticalNav.vue:23-52`).
- **Recomendação:** **paleta de comandos com Ctrl+K**, que busca páginas, fornecedores, clientes, contas (por descrição, valor ou documento), vendas e ações ("Nova conta a pagar"). Mostrar a seção atual na navbar no celular.

### G-17 · Mobile: os cards existem, mas sem hierarquia — **Médio**
- **Evidência:** `plugins/vuetify/defaults.ts:28-31` ativa o modo mobile da `VDataTable` abaixo de `md` (bom). Mas cada card repete todas as 8 ou 9 colunas como pares chave/valor e até 5 ícones de ação (`contas-a-pagar.vue:494-551`). As `VTable` nativas (consolidado, relatórios) continuam com rolagem horizontal.
- **Recomendação:** slot `#item` mobile dedicado:
  - linha 1: descrição e valor em destaque;
  - linha 2: vencimento e chip de status;
  - um botão principal ("Pagar" / "Receber") e o resto no menu "⋯".

---

## 4. Achados por módulo

Severidades: **Crítico** (gera dado errado, prejuízo ou vazamento) · **Alto** (bloqueia ou atrapalha muito uma tarefa central) · **Médio** (atrito real com contorno) · **Baixo** (polimento).

### 4.1 Dashboard e Consolidado (D)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| D-01 | Crítico | O KPI "Faturamento mensal" (agência) soma **todas** as parcelas mensais já geradas, inclusive as recebidas no passado | `composables/useFinanceMetrics.ts:159-160`; `stores/finance.ts:518-564` | Somar só as parcelas com vencimento no mês, ou uma ocorrência por série ativa |
| D-02 | Alto | Dois dos quatro KPIs principais mostram o mesmo número ("Saldo realizado (mês)" = "Resultado do mês (DRE)"), e o card "DRE resumido" repete a conta pela terceira vez | `dashboard.vue:22,25,225-249`; `useFinanceMetrics.ts:132-137` | Trocar por **Vencidos (pagar/receber)** e **Runway**. A DRE passa a mostrar mês atual × mês anterior com a variação |
| D-03 | Alto | "A pagar (7 dias)" usa o valor bruto (`m.sum`) e o alerta logo abaixo usa o saldo em aberto (`sumPayables`). Com pagamento parcial, os dois divergem | `dashboard.vue:23,33,39-41` | Usar o saldo em aberto em todo lugar e remover `sum` do composable |
| D-04 | Alto | A projeção do Dashboard inclui vencidos e a do Fluxo de Caixa não | `useFinanceMetrics.ts:119-125` × `fluxo-de-caixa.vue:24` | Regra única. Separar na UI "previsto no prazo" de "vencidos (risco)" |
| D-05 | Alto | Não há comparação com período anterior, meta ou runway. O KpiCard aceita `change`, mas ninguém passa o valor | `KpiCard.vue:8,31-43` | Δ% contra o mesmo período do mês anterior. Runway = caixa ÷ média das saídas líquidas dos últimos 3 meses |
| D-06 | Alto | O gráfico de 30 dias põe o saldo acumulado no mesmo eixo dos fluxos diários, o que achata entradas e saídas | `dashboard.vue:61-78` | Gráfico misto: colunas para entradas e saídas (eixo esquerdo) e linha para o saldo (eixo direito) |
| D-07 | Médio | O topo da tela gasta espaço com "Entradas/Saídas (total)" de todo o histórico | `dashboard.vue:17-18,119-137` | Trocar por "do mês" com a variação |
| D-08 | Médio | Saldo sem composição por conta e sem "atualizado em" | `useFinanceMetrics.ts:34-36` | Tooltip ou expansão com o saldo por conta e o horário da atualização (depende de F-09) |
| D-09 | Médio | Não há seletor de período: no dia 1º os KPIs do mês aparecem quase zerados e não dá para rever o mês anterior | `useFinanceMetrics.ts:15-30` | `PeriodPicker` (G-12), padrão mês atual |
| D-10 | Médio | A faixa de alertas trunca o texto no celular (`flex-nowrap` + `text-truncate`) | `dashboard.vue:155-183` | Quebrar em coluna no `xs` |
| D-11 | Médio | Certificado vencido aparece como "Vence em −5 dias" (também em Configurações) | `dashboard.vue:43-45`; `configuracoes.vue:166-176` | "Certificado vencido há 5 dias — emissão de NFS-e bloqueada" |
| D-12 | Médio | "NFS-e emitidas — no período" conta todo o histórico | `dashboard.vue:390-391` | Filtrar pelo mês ou renomear |
| D-13 | Médio | O mini funil mostra só contagens | `dashboard.vue:319-336` | Barras com contagem, valor e % de conversão |
| D-14 | Médio | KPIs sem definição; subtítulo em `text-disabled` | `KpiCard.vue:46-57` | Prop `hint` com ícone ⓘ explicando a fórmula em linguagem simples |
| D-15 | Médio | O consolidado não mostra o caixa do grupo nem o total a pagar; a tabela não tem linha de total e é espremida | `dashboard-consolidado.vue:16-21,101-147` | KPIs de caixa e compromissos do grupo, tabela em largura total com "Total do grupo" e "% do grupo" |
| D-16 | Médio | No consolidado, clicar numa empresa não leva a lugar nenhum | `dashboard-consolidado.vue:112-126` | Clicar troca a empresa e abre o `/dashboard` dela |
| D-17 | Médio | O consolidado tem regra de inadimplência e cores próprias (resultado negativo em `warning`, no dashboard em `error`) | `useConsolidatedMetrics.ts:50-51`; `dashboard-consolidado.vue:19-20` | Mesmos helpers e mesmo mapa de cores por métrica |
| D-18 | Médio | Gráficos vazios aparecem como linhas planas | `components/VueApexCharts.client.vue` | `noData` com a mensagem "Sem movimentações nos últimos 30 dias" |
| D-19 | Baixo | O badge de saldo some no celular e não é clicável | `DefaultLayoutWithVerticalNav.vue:37`; `CashBalanceBadge.vue:11-33` | Versão compacta no celular e link para o Fluxo de Caixa |
| D-20 | Baixo | "Vendas do mês" sem tendência | `dashboard.vue:282-288` | Δ% e sparkline do VGV dos últimos 6 meses |

**O "dashboard dos 5 segundos" proposto** (de cima para baixo):

1. **Caixa hoje.** Saldo em destaque, com a composição por conta e o horário da atualização.
2. **Os próximos 30 dias.** Cards de projeção com a conta explícita: saldo de hoje, mais o que entra, menos o que sai, igual ao projetado. Mostrar o dia em que o saldo fica negativo, se isso acontecer.
3. **Atenção.** Vencidos a pagar, vencidos a receber, o que vence em 7 dias e o certificado. Cada item leva à lista já filtrada.
4. **Desempenho.** Resultado do mês contra o mês anterior, receita, despesa e runway.
5. **Bloco do negócio.** Na imobiliária: VGV, comissões e funil com valores. Na agência: recorrência e churn.

### 4.2 Contas a Pagar e Contas a Receber (F)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| F-01 | **Crítico** | **Parcelar repete o valor total em cada parcela** (R$ 3.000 em 3× gera 3 × R$ 3.000). Além disso, vencimento no dia 31 pula de mês | `contas-a-pagar.vue:751-766`; `stores/finance.ts:416-430` | Seletor "Valor total / Valor da parcela" (padrão: total, dividido em centavos com o resto na última parcela), tabela de prévia editável, fixar o último dia do mês e aceitar só de 2 a 120 parcelas |
| F-02 | **Crítico** | Data e hora padrão do recebimento e a data de emissão vêm em UTC (`toISOString`). Às 14h em Brasília grava 17h, e depois das 21h sugere o dia seguinte | `contas-a-receber.vue:104,116,158,247` | Helper `localDateTimeInput()` no mesmo padrão de `todayISO()` |
| F-03 | Alto | O filtro "Vencido" fica preso ao mês corrente; o card de vencidos soma todos | `contas-a-pagar.vue:15,28,31`; `contas-a-receber.vue:15,25,28` | Abas com contagem e total: **Vencidos · Vencem hoje · A vencer · Pagos · Todos**, com o período como filtro à parte |
| F-04 | Alto | "Pago no mês" deixa de fora o dia 1º (`new Date('AAAA-MM-01')` é UTC), não tem limite superior e soma qualquer despesa | `contas-a-pagar.vue:49-52` | Usar o `inCurrentMonth` do composable e filtrar por `payableId` |
| F-05 | Alto | A baixa de pagamento não tem data, forma, conta, juros, multa nem desconto. O recebimento tem data e forma: são dois comportamentos para a mesma operação | `contas-a-pagar.vue:797-844`; `useDb.ts:340` | **SettleDialog** único: valor (atalho "total"), data, forma, conta, juros, multa, desconto, valor líquido e comprovante. Para pagamento menor que o saldo: "Quitar com desconto" ou "Manter saldo em aberto" |
| F-06 | Alto | Não há seleção múltipla nem ações em lote | nenhuma tabela usa `show-select` | Barra de ações: dar baixa em lote (data e conta únicas), recategorizar, cancelar, exportar |
| F-07 | Alto | Não há totais da lista filtrada nem da seleção | `contas-a-pagar.vue:426-432`; `contas-a-receber.vue:475-481` | Rodapé fixo com "N títulos · Total · Em aberto" e "Selecionados: N · R$ X" |
| F-08 | Alto | Os cards não seguem os filtros e não são clicáveis | `contas-a-pagar.vue:338-391`; `contas-a-receber.vue:387-440` | Cards que refletem o recorte atual e aplicam o filtro ao clicar |
| F-09 | Alto | A conta financeira é texto livre ("Ex.: Caixa, Banco Inter") e não há conciliação | `contas-a-receber.vue:914-918,1019-1024` | **Decisão de produto:** cadastro de contas bancárias, saldo por conta e importação de OFX com sugestão de casamento (o "match" do Xero) |
| F-10 | Alto | Fornecedor e categoria usam `VSelect` sem busca e sem cadastro rápido; o cliente é texto livre em Receber | `contas-a-pagar.vue:639-652,701-718`; `contas-a-receber.vue:721-735` | `EntityAutocomplete` com busca por nome ou documento e a opção "+ Cadastrar '…'". Ao escolher o fornecedor, sugerir a última categoria e o último centro usados com ele |
| F-11 | Alto | A ordem dos campos não prioriza o essencial; a categoria é opcional (a DRE fica com "sem categoria") | `contas-a-pagar.vue:615-718` | Valor → Vencimento → Fornecedor → Descrição → Categoria (obrigatória ou com aviso) → "Mais opções" recolhido |
| F-12 | Alto | Não há linha do tempo de baixas; o estorno só desfaz a última (Receber) ou fica escondido como "Não pago" (Pagar) | `contas-a-receber.vue:341-350`; `contas-a-pagar.vue:578-614` | Drawer de detalhes do título: linha do tempo de baixas e estornos (data, valor, forma, comprovante, usuário) e botão "Estornar" em cada baixa |
| F-13 | Alto | Risco de baixa duplicada em Pagar: um `request_key` novo a cada chamada (Receber já resolveu) | `useDb.ts:342` × `contas-a-receber.vue:251` | Gerar o `requestId` ao abrir o diálogo |
| F-14 | Alto | As recorrências dependem do botão "Gerar recorrências" e não têm data de fim; Receber oferece só "mensal" | `contas-a-pagar.vue:289-318`; `contas-a-receber.vue:829` | Gerar automaticamente numa janela de N meses, com "Repetir até / N vezes" e os mesmos tipos nos dois módulos |
| F-15 | Alto | Não há exportação nas listas | `exportCSV` só existe em `relatorios.vue` | Botão "Exportar" que respeita os filtros (CSV/XLSX/PDF) |
| F-16 | Alto (confirmar) | O carregamento usa `select('*')` sem paginação. Se o PostgREST limitar a 1.000 linhas, os dados são cortados em silêncio | `useAppData.ts:112`; `useDb.ts:381-386` | Conferir o `max_rows` do projeto, paginar com `.range()` ou buscar por período no servidor |
| F-17 | Médio | Ordenar por Categoria ou Centro ordena pelo ID interno | `contas-a-pagar.vue:59-60` | Ordenar pelo nome resolvido |
| F-18 | Médio | A busca não ignora acentos e não procura por valor nem por documento | `contas-a-pagar.vue:24-25` | Normalizar com NFD (o importador já faz) e buscar por valor e CNPJ |
| F-19 | Médio | A ação principal de Pagar é um ícone sem rótulo; Receber tem botão com texto | `contas-a-pagar.vue:496-505` × `contas-a-receber.vue:556-569` | Botão "Pagar" com texto, simétrico ao "Receber" |
| F-20 | Médio | A lixeira aparece em todas as linhas, inclusive em títulos pagos que o servidor vai recusar | `contas-a-pagar.vue:540-550`; `contas-a-receber.vue:603-613` | Esconder ou desabilitar com tooltip e mover para o menu "⋯" |
| F-21 | Médio | Os diálogos de baixa não mostram o saldo nem explicam por que o botão está desabilitado | `contas-a-receber.vue:999-1006,1058`; `contas-a-pagar.vue:809-818` | "Saldo em aberto: R$ X", com a mensagem de erro embaixo do campo |
| F-22 | Médio | Com o parcelamento ligado, a recorrência continua editável e é ignorada em silêncio; o anexo fica bloqueado | `contas-a-pagar.vue:166-167,723-727`; `stores/finance.ts:436` | Esconder a recorrência quando parcelado e permitir um anexo compartilhado |
| F-23 | Médio | A célula de vencimento é diferente em cada módulo; parcial vencido mostra só "Parcial"; título quitado mostra "Restante R$ 0,00" | `contas-a-receber.vue:506-525`; `stores/finance.ts:264` | `DueDateCell` comum aos dois módulos e chip "Parcial · Vencido" |
| F-24 | Médio | O anexo sobe antes de a baixa ser confirmada (fica órfão se o usuário cancela); não há arrastar e soltar nem prévia | `FileUpload.vue:120-127` | Upload só na confirmação, com zona de arrastar e miniatura |
| F-25 | Médio | O QuickAdd tem regras diferentes do formulário completo (NFS-e forçada, cliente opcional) e permite duplo clique | `QuickAddMenu.vue:70-74,458-461` | Mesmas regras, `:loading` e "Salvar e criar outro" |
| F-26 | Baixo | A regra de quando se pode cancelar difere: Pagar não inclui parcial, Receber inclui | `contas-a-pagar.vue:530` × `contas-a-receber.vue:593` | Regra única |

### 4.3 Fluxo de Caixa (FC)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| FC-01 | Alto | A tela não mostra o saldo de caixa de hoje, que é a base da projeção | `fluxo-de-caixa.vue:104-109` | Primeiro card "Saldo hoje", com a conta saldo + entradas − saídas = projetado |
| FC-02 | Alto | A lista de previstos exclui os vencidos e os cards de projeção os incluem | `fluxo-de-caixa.vue:24` | Seção "Em atraso" e opção "considerar vencidos" |
| FC-03 | Alto | O gráfico só mostra o passado (30 dias fixos) | `fluxo-de-caixa.vue:128-140` | Barras de realizado (cheias) e de previsto (hachuradas), linha de saldo tracejada no futuro, marcador "hoje" e horizontes de 30, 90 e 180 dias ou 12 meses |
| FC-04 | Médio | O alerta de saldo negativo é vago ("nos próximos X dias") | `fluxo-de-caixa.vue:75,86-95` | "Fica negativo em 12/11 (−R$ X)", com as principais saídas e links para os títulos |
| FC-05 | Médio | A inadimplência entra como receita certa | `useFinanceMetrics.ts:119-121` | Cenários "Conservador" e "Otimista", ou corte configurável de dias de atraso |
| FC-06 | Médio | A tabela de previstos não tem saldo corrente nem ação na linha | `fluxo-de-caixa.vue:187-223` | Coluna "Saldo após", linha clicável e exportação |
| FC-07 | Baixo | Os horizontes da tabela (até 90 dias) e dos cards (7/15/30) são independentes | `fluxo-de-caixa.vue:16-21` | Um único controle de período |

### 4.4 Importador (I)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| I-01 | **Crítico** | O parser remove todos os pontos: `1234.56` vira 123.456 e passa na validação | `importador.vue:240,253` | Detectar o formato por coluna e deixar o usuário escolher "1.234,56 / 1,234.56", com prévia do valor interpretado |
| I-02 | **Crítico** | Data ISO perde um dia (`new Date('2026-10-05')` é UTC); `05-10-2026` é lida como mês-dia | `importador.vue:208-212,255-259` | Parser explícito por formato, escolha do formato no mapeamento e rejeição do que for ambíguo |
| I-03 | Alto | Não há prévia dos dados convertidos antes de importar | `importador.vue:456-500` | Tabela com as primeiras 50 linhas já convertidas, células com erro destacadas e filtro "só erros" |
| I-04 | Alto | O número da linha com erro não corresponde à linha do arquivo | `importador.vue:297,493` | Guardar o número original da linha e permitir baixar um CSV de erros com o motivo |
| I-05 | Alto | Não há proteção contra duplicidade nem forma de desfazer | `importador.vue:284-302` | `import_batch_id`, detecção de duplicados (pular ou atualizar) e "Desfazer importação" |
| I-06 | Alto | Não importa status, pagamento, categoria nem centro; recebíveis entram com "emitir NFS-e ao receber" | `importador.vue:31-42,279-280` | Mapear esses campos, com padrão "Não emitir" para importações |
| I-07 | Médio | O mapeamento manual é apagado ao voltar de passo; duas colunas podem apontar para o mesmo campo; o arquivo é lido só como UTF-8 e não aceita XLSX; não há progresso; fornecedor não encontrado é descartado | `importador.vue:193-199,271,289-299,440-445` | Mapear automaticamente só uma vez, validar o mapeamento, detectar a codificação (Windows-1252), aceitar XLSX, mostrar "N de M" e oferecer "criar fornecedores ausentes" |
| I-08 | Baixo | "Nova importação" não limpa o estado; não há modelo de CSV para baixar | `importador.vue:555-562` | Limpar o estado e oferecer modelos por módulo |

### 4.5 Notas Fiscais — NFS-e (N)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| N-01 | Alto | Emitir é um clique direto, sem revisão. O cancelamento não pede motivo. "Emissão processada" aparece mesmo quando a nota está "processando" | `notas-fiscais.vue:88-108,329-341,518-523` | Diálogo de revisão (tomador, valor, ISS, empresa emissora, destaque "PRODUÇÃO"), cancelamento com motivo obrigatório e mensagem conforme o status final |
| N-02 | Médio | O erro da nota aparece só num tooltip (inacessível no toque); "processando" exige atualizar à mão | `notas-fiscais.vue:306-319,351-363` | Erro expandido na linha e consulta automática do status (com intervalo crescente) |
| N-03 | Médio | Não há filtro por período nem PDF (DANFSe) e os XMLs do mês não podem ser exportados em lote | `notas-fiscais.vue:20-31,489-497` | Filtro por competência, "Exportar XMLs do mês (zip)" para o contador e PDF |
| N-04 | Médio | Não há vínculo com o recebível de origem; os cards não filtram | `notas-fiscais.vue:193-242` | Link "Ver conta a receber" e cards clicáveis |

### 4.6 Comercial (C)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| C-01 | **Crítico** | "Receber" parcela de comissão faz a baixa em um clique: valor integral, data de hoje, PIX | `comissoes.vue:93-102,483-491`; `stores/finance.ts:692-698` | Usar o SettleDialog (F-05) |
| C-02 | **Crítico** | "Pagar repasse" paga o corretor em um clique, sem comprovante nem data | `comissoes.vue:103-114,531-539` | SettleDialog com "Pagar R$ X a Fulano?" e comprovante |
| C-03 | Alto | As ações financeiras não têm `loading` nem confirmação de sucesso; o duplo clique dispara duas vezes | `comissoes.vue:93-114` | `busyId` por linha, `:loading` e snackbar |
| C-04 | Alto | Os erros de Comissões, Funil, Fornecedores e Colaboradores ficam atrás do diálogo | ver G-05 | Ver G-05 |
| C-05 | **Crítico** | O corretor consegue alterar o nº de parcelas e os % de gerente e captador ao editar a venda | `vendas.vue:735-766`; `finance.ts:833` | `readonly` para quem não é `canManageFinance` e validação também na RPC `save_sale_with_commission` |
| C-06 | Alto | Não há como escolher **quem** é o gerente ou o captador: só o % | `vendas.vue:744-766`; `comissoes.vue:645-668` | Seletores de colaborador ao lado de cada %, obrigatórios quando o % for maior que 0 |
| C-07 | Alto | "% gerente" é ambíguo (% da venda ou da comissão?) e não há prévia em R$ | `vendas.vue:750,762` | Hint "% sobre o valor da venda" e "= R$ 3.200" ao lado |
| C-08 | Alto | O formulário não mostra a divisão prevista entre corretor, gerente, captador e imobiliária | `vendas.vue:774` | Resumo dinâmico da divisão antes de salvar |
| C-09 | **Crítico** | O Portal mostra ao corretor a comissão **total** da imobiliária, não a parte dele | `portal-corretor.vue:274-278` | Mostrar o valor e o status do split dele |
| C-10 | Alto | A linha do tempo do Portal mostra as parcelas que a construtora paga à imobiliária; "Recebida" sugere que o corretor já recebeu | `portal-corretor.vue:288-311` | Duas etapas: "Imobiliária recebeu" → "Seu repasse: pendente / pago em dd/mm" |
| C-11 | Médio | Os KPIs do Portal incluem distratos e não têm período; o Portal não tem ações (novo lead, extrato) | `portal-corretor.vue:40-85` | Excluir os cancelados, `PeriodPicker`, "Novo lead", "Meu funil" e "Baixar extrato" |
| C-12 | **Crítico (mobile)** | O funil usa arrastar-e-soltar HTML5 (não funciona no toque nem pelo teclado) e não há alternativa visível | `funil.vue:46-74,147,270-294` | Menu "Mover para…" em cada card e uma biblioteca com suporte a toque (SortableJS) |
| C-13 | Alto | Mudar o estágio pelo diálogo não grava o histórico e mantém o `stage_entered_at` antigo | `funil.vue:128-140`; `useDb.ts:584-587` | Chamar `moveFunnelCard` quando o estágio mudar |
| C-14 | Alto | Salvar lead sem nome não faz nada, sem nenhuma mensagem | `funil.vue:130-131` | `VForm` com `requiredRule` |
| C-15 | Alto | O funil não gera venda, não tem estágio "Perdido" e não permite arquivar | `utils/labels.ts:157-163`; `useDb.ts:585` | Em Contrato ou Escritura, "Registrar venda" com o formulário pré-preenchido; "Perdido" com motivo; arquivar |
| C-16 | Médio | O corretor pode passar o lead a outro (e o card some da visão dele); corretores inativos aparecem na lista | `funil.vue:12,390-395` | Campo bloqueado para o corretor e só colaboradores ativos na lista |
| C-17 | Médio | Quem só tem leitura abre a edição com o botão "Salvar", que não faz nada | `funil.vue:123,300`; `finance.ts:897` | Modo visualização |
| C-18 | Médio | O card do lead não tem atalho para ligar ou abrir o WhatsApp; falta o e-mail no formulário | `funil.vue:302-331` | Ícones `tel:` e `wa.me` e campo de e-mail |
| C-19 | Médio | A taxa de fechamento conta leads em andamento no denominador | `funil.vue:77-85` | Escrituras ÷ (escrituras + perdidos) no período, com tooltip explicando |
| C-20 | Baixo | O funil não tem busca nem filtro por empreendimento; o destaque da coluna pisca ao arrastar | `funil.vue:151-161,271` | Busca e filtro; checar `relatedTarget` no `dragleave` |
| C-21 | Alto | O comprador é texto livre, sem vínculo com Clientes e sem detecção de duplicidade | `vendas.vue:591-613`; `useDb.ts:490-492` | Autocomplete de clientes com "+ Novo cliente" e aviso de duplicidade de CPF + unidade |
| C-22 | Alto | CPF/CNPJ do comprador sem validação e contato sem máscara | `vendas.vue:601-613` | `DocumentField` e `PhoneField` (G-08) |
| C-23 | Alto | A lista de vendas não tem busca nem filtros de status, corretor ou empreendimento | `vendas.vue:374-376` | Busca e filtros persistidos na URL |
| C-24 | Médio | Os KPIs de Vendas incluem distratos (o Portal exclui) | `vendas.vue:35-44` | Excluir, ou mostrar um KPI "Distratos" à parte |
| C-25 | Médio | Mudar para "Distratada" não avisa o efeito na comissão e nos recebíveis | `vendas.vue:639-643` | Alerta inline e motivo obrigatório |
| C-26 | Médio | Formulário longo num único diálogo, sem `scrollable` e com o erro no topo | `vendas.vue:489-510,782-796` | Seções (Imóvel, Comprador, Condições, Comissão), `AppFormDialog` (G-09) e, de preferência, uma página `/vendas/[id]` |
| C-27 | Médio | Parcelas e % sem `rules`; limite de 12 parcelas em Vendas e de 120 em Comissões; o texto cita "RE9" fixo | `vendas.vue:738-766`; `comissoes.vue:387-423,630` | Constante compartilhada, regras de validação e nome da empresa dinâmico |
| C-28 | Médio | A lista de comissões não tem filtros nem pagamento de repasses em lote | `comissoes.vue:270-272` | Filtros e "Pagar repasses selecionados" com o total |
| C-29 | Baixo | "Editar comissão" abre mesmo quando a edição vai ser recusada | `comissoes.vue:169-171,578-584` | Reaproveitar a checagem de histórico de `vendas.vue:104-134` |
| C-30 | Alto | Não há cadastro de unidades: a mesma unidade pode ser vendida duas vezes | `CommercialDevelopmentFormDialog.vue:116-198`; `vendas.vue:559-562` | **Decisão de produto:** estoque de unidades. No mínimo, aviso de duplicidade empreendimento + unidade |
| C-31 | Médio | A validação cruzada do repasse não reavalia quando o % da construtora muda; os rótulos são inconsistentes | `CommercialDevelopmentFormDialog.vue:24-33,174`; `empreendimentos.vue:178` | Revalidar com `watch` e usar um termo único |
| C-32 | Médio | O card do empreendimento não tem métricas nem link; nome duplicado é aceito | `empreendimentos.vue:129-221`; `finance.ts:805-817` | "N vendas · VGV · N leads" com link e aviso de nome duplicado |
| C-33 | Baixo | Desativar empreendimento ou fornecedor não explica o efeito | `empreendimentos.vue:242`; `fornecedores.vue:376` | "Some de novas vendas; as vendas existentes não mudam" |
| C-34 | Alto | Clientes não pode ser editado nem inativado e não tem detalhe; o documento não tem validação e a busca não ignora pontuação | `clientes.vue:16,20-26,126,153-175`; `finance.ts:311-319` | CRUD completo, máscaras, aviso de duplicidade e detalhe com as vendas e contas do cliente |
| C-35 | Alto | Fornecedores e Colaboradores: o documento só é validado na criação, o tipo CPF/CNPJ não restringe a regra e a chave PIX não é validada | `fornecedores.vue:288,366`; `colaboradores.vue:293-332,386`; `validators.ts:77-88` | Validar sempre e conforme o tipo; validar o PIX conforme o tipo da chave |
| C-36 | Alto | Não há como vincular usuário a corretor pela interface, e o Portal depende disso | `portal-corretor.vue:153-159`; `colaboradores.vue:275-375` | Campo "Usuário de acesso" no colaborador e coluna "vinculado / sem vínculo"; o mesmo alerta em Vendas e Funil |
| C-37 | Baixo | Tabela de vendas sem rodapé de totais; o campo "Observações" existe no payload mas não no formulário | `vendas.vue:357-367`; `useDb.ts:497` | Totais no `#tfoot` e campo de observações |

### 4.7 Relatórios, Plano de Contas e Centros de Custo (R)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| R-01 | Alto | Comparativo, Comissões e Inadimplência ignoram o filtro "De / Até" que fica no topo de todas as abas | `relatorios.vue:166-247,291-316` | Aplicar o período a todas as abas, ou esconder o filtro e indicar "Posição em hoje" |
| R-02 | Alto | A DRE é uma lista plana: agrupa pelo **nome** da conta (homônimos se fundem), não tem códigos, subtotais, % da receita nem comparação | `relatorios.vue:92-112` | Agrupar por `categoryId`, consolidar pela árvore, ordenar e recuar por código, e colunas "% receita", "anterior" e "Δ%" |
| R-03 | Alto | Os totais não fecham entre DRE, balancete e centros, porque os lançamentos sem categoria ou sem centro somem em alguns deles | `relatorios.vue:145-151,216-222`; `stores/finance.ts:152` | Linhas "Sem categoria" e "Sem centro" e rodapé de conciliação ("Total igual ao da DRE ✓") |
| R-04 | Alto | Não há drill-down para os lançamentos | `relatorios.vue:377-385,492-507,682-704` | Drawer com os lançamentos da conta no período (G-10) |
| R-05 | Alto | Centros de Custo mostra o resultado de todo o histórico, e Relatórios mostra o do período: o mesmo dado com dois valores | `centros-de-custo.vue:17-25` × `relatorios.vue:217` | `PeriodPicker` com padrão mês atual |
| R-06 | Alto | O plano de contas aceita como pai um descendente (cria ciclo) ou uma conta de outro tipo | `plano-de-contas.vue:42-47` | Filtrar por tipo, excluir descendentes e herdar o tipo do pai |
| R-07 | Alto | A hierarquia visual vem de contar os pontos do código, não da relação de pai; não há validação de formato nem de unicidade | `plano-de-contas.vue:30-32,144,225-230` | Montar a árvore por `parentId`, validar o prefixo do pai e a unicidade, e sugerir o próximo código livre |
| R-08 | Médio | O balancete pinta toda despesa de vermelho (mistura natureza contábil com alerta) | `relatorios.vue:147,501-504` | Colunas D/C ou valor absoluto; cor só no saldo final |
| R-09 | Médio | A exportação muda de aba para aba; os arquivos têm nome fixo (`dre.csv`, que se sobrescreve); o PDF mostra data ISO; o XLS não formata moeda | `relatorios.vue:53,85,342-365,454-477,550-680` | Componente `<ReportExport>`, nome `dre_<empresa>_<de>_<até>`, datas pt-BR e estilo monetário |
| R-10 | Médio | O período não tem atalhos nem validação e não vai para a URL | `relatorios.vue:16-19,293-308` | `PeriodPicker` e `useQueryState` |
| R-11 | Médio | O Comparativo não tem linha de resultado, tabela, Δ% nem exportação | `relatorios.vue:533-544` | Linha de resultado, tabela com Δ% e exportação |
| R-12 | Médio | A Inadimplência cobre só os recebíveis já vencidos; as linhas não têm link | `relatorios.vue:166-182,645` | Alternar Receber/Pagar, incluir a faixa "a vencer" e linkar cada título |
| R-13 | Médio | O plano de contas não tem busca, recolher nem reordenar; o pai é escolhido num `VSelect` | `plano-de-contas.vue:139-200,256-261` | Árvore recolhível, busca e `VAutocomplete` para o pai |
| R-14 | Médio | Desativar conta ou centro não mostra o impacto (subcontas e lançamentos em aberto) | `plano-de-contas.vue:74-87,288-293`; `centros-de-custo.vue:68-81` | "Esta conta tem N subcontas e M lançamentos em aberto" |
| R-15 | Baixo | O tipo aparece duplicado no cabeçalho; o chip "Ativo" em toda linha se confunde com o tipo contábil "Ativo" | `plano-de-contas.vue:126-134,157-163` | Marcar só as inativas e filtro "mostrar inativas" |
| R-16 | Baixo | Sem estado vazio; Enter não salva; a descrição do centro não quebra linha; não há meta por centro | `plano-de-contas.vue:26,281`; `centros-de-custo.vue:116,203-229` | Estado vazio com "Criar plano padrão", submit nativo, truncamento com tooltip e meta opcional |

### 4.8 Sistema: autenticação, notificações, histórico e configurações (S)

| ID | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| S-01 | Alto | "Esqueceu a senha?" é um texto morto; não existe recuperação de senha | `login.vue:132-137` | `/recuperar-senha` com `resetPasswordForEmail` e uma página de redefinição |
| S-02 | Alto | Restaurar o histórico reverte tudo o que veio depois, sem dizer quanto | `auditoria.vue:321-376,339` | "37 ações de 4 usuários desde 12/10 14:32 na empresa X", digitar "RESTAURAR" para confirmar |
| S-03 | Médio | O login sempre vai ao Dashboard, perdendo o link de destino | `middleware/auth.global.ts:13`; `login.vue:27` | `?redirect=` validado como rota interna |
| S-04 | Médio | "Lembrar de mim" não faz nada | `login.vue:16,126-130` | Remover ou implementar |
| S-05 | Médio | Erros de autenticação aparecem em inglês | `login.vue:30-32`; `aceitar-convite.vue:38` | Mapa `authErrorMessages` em pt-BR |
| S-06 | Médio | O bloqueio por permissão redireciona sem explicar | `route-guard.global.ts:47-61` | Snackbar "Seu perfil não tem acesso a X" |
| S-07 | Médio | O erro global mostra a mensagem técnica crua e cobre a navbar | `app.vue:30-49`; `plugins/auth.ts:29` | Texto amigável, detalhe técnico recolhível e banner no fluxo da página |
| S-08 | Médio | As notificações não levam a lugar nenhum; as de outras empresas ficam invisíveis; "Marcar lidas" no sino não trata falha | `types/finance.ts:470-482`; `stores/finance.ts:137-141`; `NavbarNotifications.vue:50,68` | `targetRoute`, badge por empresa no seletor e try/catch com snackbar |
| S-09 | Médio | A gestão de usuários é só leitura e mostra os perfis do usuário em outras empresas | `configuracoes.vue:178-190,756-781` | Alterar perfil, revogar, reenviar convite, status "pendente" e filtrar pela empresa |
| S-10 | Médio | Convite e dados da empresa sem validação (e-mail, CNPJ, UF, IBGE) | `configuracoes.vue:350-397,712-727` | Regras, máscara e `VSelect` com as UFs |
| S-11 | Médio | Trocar de empresa em Configurações descarta as edições sem aviso; "Desconectar Drive" não pede confirmação | `configuracoes.vue:78-84,665-673` | Guarda de alterações e ConfirmDialog |
| S-12 | Médio | Quem só tem leitura vê os campos como `disabled` (baixo contraste, não dá para copiar) | `configuracoes.vue:303+` | `readonly` e o aviso "Somente leitura" |
| S-13 | Médio | O Histórico mostra JSON cru e filtra só por texto e entidade, no cliente, sobre até 1.000 registros | `auditoria.vue:75-89,152,285-297` | Diff por campo com rótulos e valores formatados; filtros por período, usuário e ação; paginação no servidor; exportar CSV |
| S-14 | Médio | O tema não persiste e ignora a preferência do sistema | `plugins/vuetify/index.ts:20-23` | Cookie e opção "Sistema" |
| S-15 | Baixo | Rótulos do menu: "Histórico" leva a /auditoria; "Consolidado" é vago; "Notificações" fica em "Sistema" | `NavItems.vue:27,163-184` | "Histórico de alterações", "Consolidado (todas as empresas)" |
| S-16 | Baixo | A página de erro tem resquícios do template (`alt="Coming Soon"`, mensagem genérica, sem "Voltar") | `error.vue:46-74` | Mensagem por status e botões "Voltar" e "Recarregar" |
| S-17 | Baixo | As telas de autenticação são inconsistentes entre si (logo, emoji 👋, sem `useHead`); falta "mostrar senha" no convite | `login.vue:78`; `aceitar-convite.vue:68-87` | Componente `AuthCard` e checklist dos requisitos de senha |
| S-18 | Baixo | "Sem acesso" só oferece Sair | `sem-acesso.vue:26-31` | "Verificar novamente" e "Você entrou como x@y" |
| S-19 | Baixo | Canais "(não integrado)" e instruções de variável de ambiente aparecem para o usuário final | `notificacoes.vue:225-228`; `configuracoes.vue:637` | Esconder, ou mostrar "Em breve / fale com o suporte" |
| S-20 | Baixo | O rodapé ocupa espaço no celular | `layouts/components/Footer.vue` | Esconder no `xs` |

---

## 5. Kit de componentes recomendado

A maioria dos achados some com cerca de 12 peças compartilhadas, o que garante consistência e diminui código.

| Componente / composable | Resolve |
|---|---|
| `useDataState()` + skeletons (`KpiCard`, tabela, gráfico) | G-01, D-18, F-* (vazio × carregando) |
| `useNotify()` (snackbar global com "Desfazer") | G-06, C-03, S-08 |
| `ConfirmDialog` v2 (loading, erro, texto contextual, confirmação digitada) | G-07, S-02, N-01, F-20 |
| `AppFormDialog` (submit nativo, erro interno, rolagem até o erro, guarda de descarte, "Salvar e criar outro", fullscreen no xs, empresa no subtítulo) | G-04, G-05, G-09, C-26 |
| `MoneyField`, `PercentField`, `DocumentField`, `PhoneField`, `PixKeyField` | G-08, C-22, C-35, S-10 |
| `EntityAutocomplete` (fornecedor, cliente, colaborador, conta do plano, com "+ Cadastrar") | F-10, C-21, R-13 |
| `SettleDialog` (baixa única: pagar, receber, comissão, repasse, lote) | F-05, F-13, F-21, C-01, C-02, F-06 |
| `PeriodPicker` + `useQueryState()` | G-11, G-12, D-09, R-01, R-05, R-10 |
| `DataTableShell` (seleção, barra de lote, rodapé de totais, exportação, card mobile com ação principal, `tabular-nums`) | F-06, F-07, F-15, G-15, G-17 |
| `DueDateCell` + `StatusChip` com estados combinados | F-23 |
| `EntityDrawer` (detalhe de título, venda ou lançamento, com linha do tempo e links cruzados) | F-12, G-10, R-04 |
| `useFinanceMetrics` como **fonte única** (sem cálculos locais nas páginas) | D-03, D-04, D-17, F-04, FC-02, C-24 |

---

## 6. Roteiro de execução

> **Substituído** por `docs/PLANO-CORRECOES-UX-2026-10.md`, que tem risco zero de perda de dados e não inclui funcionalidades novas.

### Onda 0 — Integridade dos números (1 semana)
F-01, F-02, F-04, I-01, I-02, D-01, F-13, F-16 (confirmar o limite) e G-02, C-05, C-09 (exposição de dados do corretor). *Critério de pronto:* testes unitários para o parcelamento, as datas locais e o parser do importador.

### Onda 1 — Confiança e segurança (1–2 semanas)
`useDataState` e skeletons (G-01), `useNotify` (G-06), ConfirmDialog v2 (G-07), erros dentro do diálogo (G-05), empresa persistente e visível (G-03, G-04), SettleDialog (F-05, C-01, C-02), revisão de NFS-e (N-01), contraste do tema (G-13), recuperação de senha (S-01).

### Onda 2 — Eficiência operacional (2–3 semanas)
MoneyField e afins (G-08), DataTableShell com lote, totais e exportação (F-06, F-07, F-15), abas de status (F-03), PeriodPicker + filtros na URL (G-11, G-12), EntityAutocomplete (F-10, C-21), ordem dos campos (F-11), recorrência automática (F-14), funil com toque e "Mover para" (C-12, C-13).

### Onda 3 — Dashboard e relatórios que orientam decisões (2–3 semanas)
Fonte única de métricas, o "dashboard dos 5 segundos" (D-02 a D-09), gráficos mistos e projetados (D-06, FC-03), KPIs clicáveis e drill-down (G-10, R-04), DRE hierárquica com comparação (R-02, R-03), plano de contas em árvore validada (R-06, R-07), consolidado útil (D-15, D-16).

### Onda 4 — Diferenciais (sob decisão de produto)
Contas bancárias e conciliação OFX (F-09), estoque de unidades (C-30), funil → venda e "Perdido" (C-15), paleta Ctrl+K (G-16), Portal do corretor com autosserviço e extrato (C-10, C-11), importador com prévia e desfazer (I-03 a I-07), Histórico com diff legível (S-13), metas e orçamento por conta e centro.

---

## 7. Como medir se melhorou

| Métrica | Como medir | Meta |
|---|---|---|
| Tempo para lançar uma conta a pagar | Teste moderado (5 usuários) ou evento de telemetria do abrir ao salvar | < 30 s |
| Tempo para baixar o lote mensal (20 títulos) | Teste moderado | < 2 min (hoje são 20 diálogos) |
| Taxa de erro de lançamento | Estornos e edições de valor em até 24 h ÷ lançamentos | queda de 50% |
| Divergência entre telas | Teste automatizado: card × lista, DRE × balancete × centros | 0 |
| Ações financeiras de um clique | Revisão de código | 0 |
| Conformidade WCAG AA | axe-core no CI nas 10 páginas principais | 0 violações sérias |
| Confiança percebida | Pergunta trimestral "Confio nos números do sistema" (1–5) | ≥ 4,5 |
| Adoção do Portal pelos corretores | Acessos semanais de corretores ÷ corretores ativos | ≥ 70% |

---

## 8. Pontos fortes a preservar

- **Livro-caixa auditável:** estorno e reabertura exigem motivo, preservam o histórico e geram a contrapartida (`contas-a-pagar.vue:597-613`, `contas-a-receber.vue:1076-1091`).
- **Idempotência no recebimento** (`requestId` estável) e mensagens honestas em falhas parciais ("conta salva, mas o anexo falhou").
- **Permissões em camadas:** route guard, RLS e revalidação na store; ações escondidas para quem só tem leitura.
- **Proteção da comissão com histórico financeiro** (`vendas.vue:104-134`), com explicação clara.
- **Formatação pt-BR centralizada** (`utils/format.ts`), somas em centavos (`financeLedger.ts`) e datas puras tratadas como locais na maior parte do código.
- **Responsividade global pensada:** alvos de toque de 44 px, tabelas em cards abaixo de `md` e diálogos contidos na tela (`layouts/default.vue`).
- **Explicações dentro do fluxo:** regras de NFS-e, consequências de exclusão, ajuda que muda com o tipo de empreendimento.
- **CSV compatível com Excel pt-BR** (BOM, `;`, vírgula decimal); importador com detecção de separador e mapeamento por sinônimos.
- **Atalho global "+"**, `AppPageHeader` padronizado e dashboard adaptado ao tipo de empresa.
- **NFS-e honesta:** não simula a emissão, mostra o ambiente e avisa do vencimento do certificado.

---

## 9. Decisões de produto pendentes

Estas definem o escopo da Onda 4 e de alguns itens anteriores. São escolhas de negócio, não técnicas:

1. **Contas bancárias e conciliação** (F-09): vamos ter saldo por banco e importar extrato (OFX), ou o caixa continua único?
2. **Estoque de unidades** (C-30): a imobiliária quer controlar a disponibilidade das unidades de cada empreendimento?
3. **Metas e orçamento** (D-05, R-16): o dono quer comparar o realizado com uma meta mensal por conta ou centro de custo?
4. **O que o Visualizador e o Contador veem** (G-02): o saldo de caixa deve aparecer para eles?
5. **Estágio "Perdido" no funil** (C-15): vamos registrar os negócios perdidos com motivo, para medir a conversão de verdade?
6. **Inadimplência na projeção** (FC-05): a partir de quantos dias de atraso um recebível deixa de contar como dinheiro esperado?
