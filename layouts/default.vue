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
</style>
