# RE9 Finanças — Auditoria de Frontend (responsividade, controles e textos)

> Gerado em 2026-07-11. Auditoria focada em **responsividade**, **funcionamento de
> botões/links**, **textos** e **acessibilidade** de todas as 22 rotas + componentes
> de layout. Metodologia: revisão estática do código (4 varreduras paralelas) +
> verificação em runtime no navegador (viewports **375px**, **768px** e **1280px**),
> medindo overflow horizontal real, títulos truncados e diálogos.

## Resumo

- **22 rotas** + layout/menu + 7 componentes globais auditados.
- **0** botões/links mortos (todo controle tem handler, `to`/`href` ou `type="submit"`).
- **0** textos em inglês / placeholders / mojibake — tudo em PT-BR.
- **0** overflow horizontal de documento em 375/768/1280px após os ajustes.
- Defeitos encontrados e corrigidos: **1 de responsividade grave**, **1 de
  responsividade no cadastro**, **1 título truncado (global)** e **~15 controles sem
  nome acessível**.

---

## Defeitos encontrados e corrigidos

### 1. [Responsividade — grave] Botões de exportação estouram fora da tela no mobile
`pages/relatorios.vue` — Cards de DRE e Balancete usam `title="..."` + slot `#append`
com 3 botões de exportação (Excel/PDF/CSV, ~245px). O cabeçalho do card (`.v-card-item`)
usa `display: grid` no Vuetify, mantendo os botões na mesma coluna do título; em telas
estreitas o grupo de botões era empurrado para fora da tela (medido: borda direita em
**415px** num viewport de 375px — cortado/oculto).

**Correção:** override global em `layouts/default.vue` (estilo não-scoped do layout).
Abaixo de 600px o cabeçalho do card vira `display: flex; flex-wrap: wrap` — o título fica
na 1ª linha e as ações descem para a linha de baixo. A classe repetida
(`.v-card-item.v-card-item`) eleva a especificidade para vencer o `grid` do Vuetify
independente da ordem de carga. Medido após o ajuste (build de produção, porta limpa):
`display: flex`, botões dentro da viewport, documento sem overflow. No desktop (≥600px)
nada muda: o layout `grid` original é preservado.

> **Nota técnica importante:** a primeira tentativa colocou o CSS em
> `assets/styles/styles.scss` (array `css` do `nuxt.config`). No build de produção o Nuxt
> **inlinava esse CSS global no SSR e o removia dos bundles do cliente**, então a regra
> sumia após a navegação SPA. A correção definitiva foi mover o override para o estilo do
> **componente de layout** (`layouts/default.vue`), cujo CSS é entregue como folha linkada
> ao cliente e se aplica em toda navegação. (Evitou-se `features.inlineStyles: false` por
> alterar a entrega de CSS de toda a aplicação.)

### 2. [Responsividade — global] Títulos de card longos truncados no mobile
`pages/comissoes.vue` (e qualquer card com título longo) — o `VCardTitle` do Vuetify tem
`white-space: nowrap` + `text-overflow: ellipsis`, então títulos de seção longos (ex.:
"Como funcionam os cenários de recebimento") apareciam cortados com reticências.

**Correção:** override global em `layouts/default.vue` (`.v-card-item .v-card-title`)
permitindo que os títulos de card quebrem em várias linhas. Corrige comissões e previne o
problema em toda a aplicação.

### 3. [Responsividade — cadastro] Texto de consentimento cortado no registro
`pages/register.vue` — a linha do checkbox "Concordo com a política de privacidade e os
termos" usava `d-flex align-center` (sem quebra) e o `VLabel` do Vuetify é `nowrap`;
no mobile o texto vazava para fora da tela (medido: borda direita em **446px** num
viewport de 375px, ~71px cortados).

**Correção:** `flex-wrap` na linha + `white-space: normal` no label. Medido após o
ajuste: borda direita em **323px** (dentro da viewport), sem overflow.

### 4. [Acessibilidade] Botões só-ícone e campos sem nome acessível
Vários botões de ação eram apenas ícones (`ri-pencil-line`, `ri-close-circle-line`,
`ri-eye-line`, `ri-attachment-2`, toggle `ri-forbid-line`/`ri-check-line`, menu, sino
de notificações) sem `aria-label`/`title`/tooltip — leitores de tela não anunciavam
nada. Alguns campos de busca/seleção tinham só `placeholder` (não é rótulo acessível).

**Correção:** seguindo o padrão já usado no app (`<VTooltip activator="parent">`),
foram adicionados `aria-label` (state-aware nos toggles: "Ativar"/"Desativar") e
tooltip aos botões, e `aria-label` aos campos de busca e ao seletor de horizonte:

| Arquivo | Controles corrigidos |
|---------|----------------------|
| `pages/contas-a-pagar.vue` | busca; editar; cancelar; ver comprovante |
| `pages/contas-a-receber.vue` | busca; editar; cancelar |
| `pages/plano-de-contas.vue` | editar; ativar/desativar |
| `pages/centros-de-custo.vue` | editar; ativar/desativar |
| `pages/fornecedores.vue` | editar; ativar/desativar |
| `pages/colaboradores.vue` | editar |
| `pages/empreendimentos.vue` | busca; editar; ativar/desativar |
| `pages/vendas.vue` | ver detalhes |
| `pages/fluxo-de-caixa.vue` | seletor de horizonte de projeção |
| `layouts/components/DefaultLayoutWithVerticalNav.vue` | abrir/fechar menu |
| `layouts/components/NavbarNotifications.vue` | sino de notificações |

---

## Investigado a fundo — menu lateral no mobile (SEM defeito de código)

O drawer de navegação no mobile (`@layouts/components/VerticalNav.vue`) abre com a classe
`.visible`, que desliga a regra `:not(.visible){ transform: translateX(-260px) }` — código
**padrão do tema Materio**. Ao testar no navegador automatizado, a transição CSS
(`transition: transform 0.25s` + `will-change: transform`) ficava presa no estado inicial
(`running`, sem avançar), dando a impressão de que o drawer não abria.

**Diagnóstico:** cancelando a transição, o drawer aparece imediatamente na posição correta
(`left: 0`, `transform: none`) — ou seja, a lógica CSS está **correta**. A transição não
avança porque o navegador headless/automatizado não "tica" animações de camadas
compositadas (`will-change: transform`); transições dirigidas por JS (diálogos do Vuetify)
assentam normalmente. É um artefato do ambiente de teste, não um defeito — o código é o
padrão Materio usado em produção. **Não foi alterado** (mexer em código correto por causa
de um artefato de renderização seria errado e poderia quebrar a animação real).

## Verificado e SEM defeito

- **Sem overflow horizontal** de documento em nenhuma das 22 rotas nos 3 viewports.
- **Tabelas largas** (contas, comissões, notas, vendas) rolam horizontalmente dentro do
  próprio wrapper do `VDataTable` (`overflow-x: auto`) — não estouram a página.
- **Kanban do funil** tem wrapper `overflow-x: auto` — rola, não estoura.
- **Diálogos** (Nova conta, Nova venda com comissão) centralizados e sem overflow
  interno no mobile.
- **Login/Register** centralizados, árvores decorativas ocultas no mobile
  (`d-none d-md-block`); fluxo de login funciona (valida e-mail contra o seed).
- **Links de navegação** apontam todos para rotas existentes; `v-for` sempre com `:key`;
  todo `@click` referencia função definida.

## Metodologia de verificação

1. Revisão estática de 22 páginas + 11 componentes (dead controls, i18n, breakpoints,
   bindings, a11y).
2. Runtime no navegador em 375/768/1280px: medição de `scrollWidth vs clientWidth` do
   documento e de cada elemento, detecção de títulos truncados (`scrollWidth >
   clientWidth`), inspeção de diálogos.
3. `pnpm lint` (config do projeto) — 0 erros nos arquivos alterados.
4. Build de produção — sucesso.
