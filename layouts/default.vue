<script lang="ts" setup>
import DefaultLayoutWithVerticalNav from './components/DefaultLayoutWithVerticalNav.vue'
</script>

<template>
  <DefaultLayoutWithVerticalNav>
    <slot />
  </DefaultLayoutWithVerticalNav>
</template>

<style lang="scss">
// As we are using `layouts` plugin we need its styles to be imported
@use "@layouts/styles/default-layout";

// ---------------------------------------------------------------------------
// Overrides globais de responsividade dos cabeçalhos de card (VCardItem).
// Ficam aqui (estilo não-scoped do layout) porque o CSS do layout é entregue
// como folha linkada ao cliente — ao contrário do css global do nuxt.config,
// que era inlinado no SSR e sumia após a navegação SPA no build de produção.
// ---------------------------------------------------------------------------

// Títulos de card (VCardTitle) vêm com `white-space: nowrap` + ellipsis no
// Vuetify, cortando títulos longos de seção. Aqui deixamos quebrar linha.
.v-card-item .v-card-title {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}

// O cabeçalho do card usa `display: grid` no Vuetify, mantendo as ações
// (#append) na mesma coluna do título — o que estourava para fora da tela no
// mobile em cards com título longo + botões (ex.: exportações nos Relatórios).
// Abaixo de 600px trocamos para flex com quebra: título na 1ª linha, ações
// descem para a linha de baixo. A classe repetida eleva a especificidade para
// vencer a regra `display: grid` do Vuetify independente da ordem de carga.
@media (max-width: 599.98px) {
  .v-card-item.v-card-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    row-gap: 0.5rem;
  }

  .v-card-item .v-card-item__content {
    min-width: 0;
    overflow: visible;
  }

  .v-card-item .v-card-item__append {
    padding-inline-start: 0;
  }
}

// ---------------------------------------------------------------------------
// Contraste do tooltip dos gráficos (ApexCharts).
// O ApexCharts injeta o tooltip FORA do componente Vue (anexado ao
// `.apexcharts-canvas`) com o tema "light" padrão: caixa branca, mas SEM cor
// de texto explícita — o texto herda a cor da página. No modo escuro isso dá
// texto claro sobre fundo branco = ilegível. O override adaptativo do tema
// (@core/scss/.../apex-chart.scss) vem pelo `css:` array do nuxt.config, que é
// inlinado no SSR e NÃO chega ao cliente — então some na navegação SPA.
// Repetimos a regra aqui (folha do layout, entregue ao cliente) usando as
// variáveis do Vuetify, corrigindo em light e dark, em todos os gráficos.
.apexcharts-canvas {
  .apexcharts-tooltip,
  .apexcharts-tooltip.apexcharts-theme-light,
  .apexcharts-tooltip.apexcharts-theme-dark {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  }

  .apexcharts-tooltip-title {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    font-weight: 500;
  }

  .apexcharts-tooltip-text,
  .apexcharts-tooltip-text-y-label,
  .apexcharts-tooltip-text-y-value,
  .apexcharts-tooltip-text-goals-label,
  .apexcharts-tooltip-text-goals-value,
  .apexcharts-tooltip-marker + .apexcharts-tooltip-text {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  }

  // Tooltip dos eixos (x/y) — mesma lógica de contraste.
  .apexcharts-xaxistooltip,
  .apexcharts-yaxistooltip {
    border-color: rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgb(var(--v-theme-surface));
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  }

  .apexcharts-xaxistooltip-text,
  .apexcharts-yaxistooltip-text {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  }

  // As "setinhas" (arrows) dos tooltips de eixo herdam a cor de fundo.
  .apexcharts-xaxistooltip-bottom::before {
    border-bottom-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .apexcharts-xaxistooltip-bottom::after {
    border-bottom-color: rgb(var(--v-theme-surface));
  }
}
</style>
