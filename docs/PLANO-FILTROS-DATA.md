# Plano — Filtros de data (Vendas, Comissões, Contas a Pagar/Receber)

## Objetivo
Adicionar filtros de período às listas:
- **Contas a Pagar** e **Contas a Receber** → filtro por **mês** (sobre `dueDate`).
- **Vendas** e **Comissões** → filtro por **período**: presets **7d / 15d / 30d**,
  **Tudo**, e **intervalo personalizado** (data início + data fim).

## Campos de data usados
| Página | Campo filtrado |
|--------|----------------|
| Contas a Pagar | `Payable.dueDate` (vencimento) |
| Contas a Receber | `Receivable.dueDate` (vencimento) |
| Vendas | `Sale.saleDate` |
| Comissões | data da **venda** relacionada (`sale.saleDate`, fallback `commission.createdAt`) |

## Escopo do filtro (o que ele afeta)
- **Vendas** e **Comissões**: o período filtra **a tabela E os KPIs** (os KPIs são
  agregados diretos das linhas — "Vendas", "VGV total", "Comissão gerada",
  "Recebido", etc. — então passam a refletir o período selecionado).
- **Contas a Pagar/Receber**: o filtro de mês afeta **somente a tabela**. Os KPIs
  ("Em aberto", "Vencidas", "Pago no mês", "Total cadastrado") têm semântica
  própria de status/mês corrente e permanecem globais (mudá-los confundiria).

## Componentes/arquivos novos
1. **`utils/dateFilter.ts`** (auto-import) — lógica pura e testável:
   - `monthKey(iso)` → `'YYYY-MM'`.
   - `buildMonthOptions(dates: string[])` → `[{title:'Todos os meses', value:'all'}, …]`
     com meses presentes nos dados, ordenados do mais recente ao mais antigo,
     rotulados por `formatMonthYear`.
   - `presetWindow(preset)` → `{ start, end }` (ISO, inclusivo) para `'7d'|'15d'|'30d'`;
     `'all'` → `{ start:null, end:null }`.
   - `isWithin(iso, start, end)` → boolean (limites inclusivos, compara por data).
2. **`components/PeriodRangeFilter.vue`** — usado em Vendas e Comissões.
   - Estado interno: `preset` (`all|7d|15d|30d|custom`), `start`, `end`.
   - UI: `VBtnToggle` (Tudo/7d/15d/30d) + dois `VTextField type="date"` (Início/Fim);
     mexer nas datas muda o preset para `custom`; escolher um preset limpa as datas.
   - `v-model` = `{ start: string|null, end: string|null }` (janela normalizada,
     inclusiva) que a página usa para filtrar. Default: **Tudo**.
3. **`components/MonthFilter.vue`** — usado em Contas a Pagar e Receber.
   - Props: `dates: string[]` (as datas candidatas p/ montar as opções).
   - `v-model` = `'all' | 'YYYY-MM'`. UI: `VSelect` com `buildMonthOptions(dates)`.
   - Default: **Todos os meses**.

## Alterações por página
- **vendas.vue**: `periodWindow = ref({start:null,end:null})`; `filteredSales` =
  `visibleSales` ∩ janela (por `saleDate`). KPIs (`totalSales`, `totalVgv`,
  `totalCommission`) e a `VDataTable` passam a usar `filteredSales`. Filtro no topo
  da tabela (linha de filtros nova, dentro do `VCard`).
- **comissoes.vue**: adicionar `saleDate` ao map de `rows`; `filteredRows` = `rows`
  ∩ janela. KPIs e tabela usam `filteredRows`; `totalBrokerPayouts` restringe aos
  splits das comissões visíveis. Filtro no topo da tabela.
- **contas-a-pagar.vue**: `monthFilter = ref('all')`; no `filtered`, adicionar
  `okMonth = monthFilter==='all' || monthKey(p.dueDate)===monthFilter`. Adicionar
  `<MonthFilter :dates="…dueDates" v-model=…>` na linha de filtros existente.
- **contas-a-receber.vue**: idem, sobre `r.dueDate`.

## Testes
- **`tests/dateFilter.test.ts`** (mesmo runner `tsx`/assert): cobre `monthKey`,
  `presetWindow` (limites), `isWithin` (inclusivo/exclusivo) e `buildMonthOptions`
  (ordenação + "Todos"). Atualizar script `test` do package.json p/ rodar os dois.

## Verificação
1. `pnpm test` (lógica das datas).
2. `pnpm build` (compila).
3. Navegador logado: em cada página, aplicar cada preset/mês e conferir que a
   tabela (e, em Vendas/Comissões, os KPIs) muda coerentemente; intervalo
   personalizado; e "Tudo/Todos" restaura tudo.

## Não-escopo
- Não altera Dashboard/Fluxo de Caixa/Relatórios (fora do pedido).
- Não persiste o filtro entre navegações (estado local por página).
