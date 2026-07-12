# RE9 Finanças — Auditoria Completa & Plano de Correção

> Gerado em 2026-07-11 · app Nuxt 3 + Vuetify 3 (tema Materio), multi-tenant, dados in-memory (Pinia + seed).
> Escopo: auditoria de correção, escopo multi-tenant, permissões por perfil, matemática financeira,
> reatividade, datas/timezone, UX e resíduos do template. Fonte de comportamento esperado:
> `2026-06-23-re9-financas-design.md`.

## Método

Leitura integral do núcleo (`types`, `data/seed`, `stores`, `composables`, `utils`) + varredura das 26 páginas
e da infraestrutura (layouts, componentes, plugins, auth) por 4 auditores paralelos, cruzando cada página
com a API do store. Lint executado como verdade objetiva (só apontou estilo — nada funcional). Cada achado
abaixo foi **verificado no código**, não é especulação.

Legenda de severidade: **Crítico** (quebra app / dado errado grave) · **Alto** · **Médio** · **Baixo**.

---

## Resumo executivo

| # | Severidade | Área | Problema | Status |
|---|-----------|------|----------|--------|
| 1 | Crítico | Infra | `app.vue` usa `configStore` indefinido → crash em mobile | ✅ corrigido |
| 2 | Alto | Comissões | Pagar repasse não atualiza o `CommissionSplit` (KPI e botão dessincronizados) | ✅ corrigido |
| 3 | Alto | Permissões | Corretor pode criar/editar/desativar empreendimentos e alterar % de comissão | ✅ corrigido |
| 4 | Alto | Permissões | Corretor pode dar baixa em comissões da imobiliária e pagar repasses | ✅ corrigido |
| 5 | Alto | Fiscal | Numeração de NFS-e conta faturas de **todas** as empresas (cruza tenants) | ✅ corrigido |
| 6 | Alto | Segurança | Sem middleware de rota: perfis somente-leitura / agência acessam páginas por URL | ✅ corrigido |
| 7 | Alto | Fluxo de caixa | Projeção assimétrica: soma vencidos a pagar, ignora vencidos a receber, sem piso de data | ✅ corrigido |
| 8 | Médio | Dashboard | KPIs "7 dias" a pagar/receber incluem qualquer vencido (sem piso de data) | ✅ corrigido |
| 9 | Médio | Reatividade | Editar item vencido grava status derivado `overdue` de volta no store | ✅ corrigido |
| 10 | Médio | Datas | `inCurrentMonth` faz parse UTC de data pura → perde vendas do dia 1º do mês | ✅ corrigido |
| 11 | Médio | Relatórios | CSV usa `.` decimal com delimitador `;` → Excel pt-BR lê valor errado | ✅ corrigido |
| 12 | Médio | Importador | Mapeamento de colunas não é refeito ao trocar o módulo de destino | ✅ corrigido |
| 13 | Médio | Vendas | Dropdown "Corretor" lista todos os colaboradores (inclui CLT/PJ) | ✅ corrigido |
| 14 | Médio | Funil | Corretor vê/arrasta/edita cards de todos os corretores (sem escopo por dono) | ✅ corrigido |
| 15 | Médio | Funil | Drag & drop não inicia no Firefox (falta `dataTransfer.setData`) + estado preso | ✅ corrigido |
| 16 | Médio | Template | Anúncio "Upgrade to Pro" (Materio) renderizado em todas as telas | ✅ corrigido |
| 17 | Médio | Template | Marca "Materio" e textos em inglês em login/register | ✅ corrigido |
| 18 | Baixo | Datas | `todayISO()` pode retornar o dia seguinte à noite (UTC) | ✅ corrigido |
| 19 | Baixo | Financeiro | KPI "Total cadastrado" soma itens cancelados | ✅ corrigido |
| 20 | Baixo | Parcelamento | `createInstallmentPayable` perde `notes`/`proofUrl` | ✅ corrigido |
| 21 | Baixo | Multi-tenant | Lookups (`saleById`, `developmentName`, …) não escopados por empresa | ✅ corrigido |
| 22 | Baixo | Portal | Qualquer colaborador com `userId` é tratado como corretor | ✅ corrigido |
| 23 | Baixo | Multi-tenant | `setCompany` não restringe a empresas acessíveis | ✅ corrigido |
| 24 | Baixo | UI | "Acessar como" mostra o perfil da 1ª empresa, não da atual | ✅ corrigido |
| 25 | Baixo | Auth | Links mortos ("Esqueceu a senha?", termos) e link relativo inconsistente | ✅ corrigido |
| 26 | Baixo | i18n | `error.vue` em inglês | ✅ corrigido |
| 27 | Baixo | Notificações | `companyNotifications` ignora `userId` (badge vaza entre usuários) | ✅ corrigido |
| 28 | Baixo | Template | Páginas-demo do Materio acessíveis por URL; `account-settings` com tab quebrada | ✅ corrigido |
| 29 | Baixo | Cadastros | `fornecedores.openEdit` não garante `bankInfo` (pode lançar) | ✅ corrigido |
| 30 | Baixo | Fluxo de caixa | "Saldo acumulado" começa em 0, sem saldo de abertura | ✅ corrigido |
| 31 | Baixo | Config | Aba "Perfis & Acesso" lista usuários de todas as empresas | ✅ corrigido |
| 32 | Baixo | Segurança | Ações do store sem guarda de perfil (defesa em profundidade) | ✅ corrigido |
| 33 | Baixo | Validação | Diálogos de cadastro sem validação de campos obrigatórios | ✅ corrigido |
| 34 | Médio | Permissões | (achado na revisão) Vendas mostrava todas as vendas da empresa ao corretor | ✅ corrigido |

---

## Detalhamento & plano técnico por item

### 1 — [Crítico] `app.vue` crash em mobile
`app.vue:6` executa `configStore.appContentLayoutNav = 'vertical'` quando `useDevice().isMobile`, mas
`configStore` nunca é importado/declarado. Em qualquer dispositivo mobile lança `ReferenceError` no topo do
setup e quebra todo o shell. Desktop escapa (branch não roda).
**Correção:** remover o bloco morto (o layout já é vertical por padrão) e remover import do `UpgradeToPro`.

### 2 — [Alto] Pagar repasse não atualiza o split
`comissoes.vue` → `finance.payPayable(payableId)` marca a conta paga mas nunca toca o `CommissionSplit`
vinculado. `sp.status` fica `pending` para sempre: botão "Pagar repasse" continua visível e o KPI
`totalBrokerPayouts` nunca baixa.
**Correção:** em `payPayable`, localizar `commissionSplits.find(s => s.payableId === id)` e marcar `paid`.

### 3 e 4 — [Alto] Corretor com permissões de admin
Controles em `empreendimentos.vue` e `comissoes.vue` são gated só por `!app.isReadOnly`. Como `isReadOnly`
= `accountant || viewer`, o perfil **broker** passa e pode: editar `commissionPercentage`/`brokerSplitPercentage`
(que alimentam o motor de comissões) e dar baixa/repasse em comissões da imobiliária.
**Correção:** novo getter `canManageFinance = !isReadOnly && !isBroker` no `app` store; aplicar nesses controles.

### 5 — [Alto] Numeração de NFS-e cruza empresas
`issueInvoice` usa `this.invoices.filter(status==='issued').length + 144` sobre o array cru (duas empresas).
Numeração deve ser por empresa e monotônica.
**Correção:** contar sobre `companyInvoices` e usar base de sequência por tipo de empresa (imob 144 / agência 311).

### 6 — [Alto] Sem middleware de rota
Não existe `middleware/`. Perfis somente-leitura abrem páginas de edição por URL; empresa "agência" abre
páginas exclusivas de imobiliária. A ocultação é só cosmética no menu.
**Correção:** middleware global `route-guard.global.ts` que redireciona: páginas comerciais quando
`isAgency`; páginas de gestão quando `isReadOnly`; portal do corretor só para broker. (Auth de credenciais
permanece mock — ver plano de melhorias.)

### 7 e 8 — [Alto/Médio] Projeção e KPIs de vencimento
`useFinanceMetrics`: `futureOut`/`weekPayables`/`weekReceivables` filtram `daysUntil <= N` sem piso, então
qualquer vencido (dias negativos) entra como "próximos N dias"; e `futureIn` exige `>= 0`, ficando
assimétrico (soma dívida vencida, ignora recebível vencido).
**Correção:** padronizar — separar "vencidos" de "a vencer"; nas janelas futuras usar `daysUntil >= 0 && <= N`
nos dois lados; projeção = saldo + a_vencer_in − a_vencer_out − vencidos_out + vencidos_in (política única).

### 9 — [Médio] Edição grava status derivado
`withDerivedStatus` devolve objeto novo com `status:'overdue'` para itens vencidos; `openEdit` clona esse
objeto derivado e `save()` grava `overdue` no store (e nunca "desvence").
**Correção:** `openEdit` lê o registro **cru** do store por id; e `withDerivedStatus` passa a rebaixar
`overdue→open` quando a data volta ao futuro (idempotente).

### 10 — [Médio] `inCurrentMonth` off-by-one
`new Date('2026-07-01')` = UTC → 30/06 21:00 local (UTC-3) < início do mês → some venda do dia 1º.
**Correção:** parsear data pura como local: `new Date(\`${iso.slice(0,10)}T00:00:00\`)`.

### 11 — [Médio] CSV decimal `.` com delimitador `;`
Excel pt-BR lê `1234.5` como `12345`. **Correção:** localizar números (`toLocaleString('pt-BR')`) nas células numéricas do CSV.

### 12 — [Médio] Importador com mapa preso
Guarda `!mapping.length` impede reconstruir o mapeamento ao trocar módulo → VSelects com valores inválidos.
**Correção:** recriar `mapping` num `watch(targetModule)`.

### 13 — [Médio] Corretor inválido em Vendas
`brokerOptions` lista todos os colaboradores. **Correção:** filtrar `employmentType === 'commission_only'` (como o funil já faz).

### 14 — [Médio] Funil sem escopo por corretor
Broker vê/edita cards de todos. **Correção:** quando `isBroker`, forçar `brokerId === ownBrokerId` e bloquear
arrastar/editar cards alheios.

### 15 — [Médio] Drag & drop Firefox
`onDragStart` não chama `dataTransfer.setData`; sem `@dragend`. **Correção:** setar dados no dragstart + handler `dragend` para limpar estado.

### 16 e 17 — [Médio] Resíduos do template
`UpgradeToPro` global e marca "Materio"/inglês em login/register. **Correção:** remover componente; rebrand PT-BR "RE9 Finanças".

### 18–33 — [Baixo] Ajustes finos
`todayISO` local; KPIs de total excluem `cancelled`; parcelas carregam `notes`/`proofUrl`; lookups do store
escopados por `cid`; portal e vendas exigem `commission_only`; `setCompany` restrito a empresas acessíveis;
"Acessar como" resolve perfil da empresa atual; links reais em login/register; `error.vue` PT-BR;
`companyNotifications` filtra por `userId`; páginas-demo removidas e tab de `account-settings` corrigida;
`fornecedores.openEdit` garante `bankInfo`; saldo de abertura no fluxo; aba de perfis filtra por empresa;
ações do store com guarda de perfil (defesa em profundidade); validação de campos obrigatórios nos diálogos.

### 34 — [Médio] (achado na revisão) Vendas sem escopo por corretor
Durante a revisão, notou-se que `pages/vendas.vue` listava todas as vendas da empresa mesmo para o perfil
Corretor (o funil e o portal já escopavam, vendas não). **Correção:** `visibleSales` filtra por
`ownBrokerId` quando `isBroker`; KPIs e tabela passam a usar `visibleSales`.

---

## Verificação final (revisão)

Após implementar as 34 correções, a revisão executou:

- **ESLint** em todos os arquivos alterados (`stores`, `composables`, `utils`, `middleware`, `pages`,
  `layouts`, `app.vue`, `error.vue`): **0 erros, 0 warnings**.
- **Build de produção** (`npm run build`): **sucesso** — client, server e Nitro compilados (exit 0).
  Únicos avisos são de extração de estilos SSR do Vuetify (benignos, alheios às mudanças).
- **Runtime SSR** (`node .output/server/index.mjs`): as **19 rotas reais respondem 200** sem erro de
  render; rotas-demo removidas (`/tables`, `/account-settings`, `/icons`) retornam **404**; `/` redireciona
  para `/dashboard`.

Nenhum erro remanescente encontrado. Próximo passo: [MELHORIAS-2026-07.md](MELHORIAS-2026-07.md).
