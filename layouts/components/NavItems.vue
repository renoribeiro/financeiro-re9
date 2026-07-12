<script lang="ts" setup>
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import { useAppStore } from '@/stores/app'
import { useFinanceStore } from '@/stores/finance'

const appStore = useAppStore()
const financeStore = useFinanceStore()

const unread = computed(() => financeStore.unreadNotificationCount)
</script>

<template>
  <!-- 👉 Principal -->
  <VerticalNavLink
    :item="{
      title: 'Dashboard',
      icon: 'ri-dashboard-line',
      to: '/dashboard',
    }"
  />
  <VerticalNavLink
    v-if="appStore.isSuperAdmin"
    :item="{
      title: 'Consolidado',
      icon: 'ri-stack-line',
      to: '/dashboard-consolidado',
    }"
  />

  <!-- 👉 Financeiro (oculto para o corretor) -->
  <template v-if="!appStore.isBroker">
    <VerticalNavSectionTitle :item="{ heading: 'Financeiro' }" />
    <VerticalNavLink
      :item="{
        title: 'Contas a Pagar',
        icon: 'ri-arrow-up-circle-line',
        to: '/contas-a-pagar',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Contas a Receber',
        icon: 'ri-arrow-down-circle-line',
        to: '/contas-a-receber',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Fluxo de Caixa',
        icon: 'ri-line-chart-line',
        to: '/fluxo-de-caixa',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Plano de Contas',
        icon: 'ri-list-check-2',
        to: '/plano-de-contas',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Centros de Custo',
        icon: 'ri-price-tag-3-line',
        to: '/centros-de-custo',
      }"
    />
  </template>

  <!-- 👉 Comercial (somente imobiliária) -->
  <template v-if="appStore.isRealEstate">
    <VerticalNavSectionTitle :item="{ heading: 'Comercial' }" />
    <VerticalNavLink
      :item="{
        title: 'Vendas',
        icon: 'ri-home-4-line',
        to: '/vendas',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Funil de Vendas',
        icon: 'ri-filter-3-line',
        to: '/funil',
      }"
    />
    <template v-if="appStore.canManageFinance">
      <VerticalNavLink
        :item="{
          title: 'Empreendimentos',
          icon: 'ri-building-2-line',
          to: '/empreendimentos',
        }"
      />
      <VerticalNavLink
        :item="{
          title: 'Comissões',
          icon: 'ri-hand-coin-line',
          to: '/comissoes',
        }"
      />
    </template>
    <VerticalNavLink
      :item="{
        title: 'Portal do Corretor',
        icon: 'ri-user-star-line',
        to: '/portal-corretor',
      }"
    />
  </template>

  <!-- 👉 Cadastros (oculto para o corretor) -->
  <template v-if="!appStore.isBroker">
    <VerticalNavSectionTitle :item="{ heading: 'Cadastros' }" />
    <VerticalNavLink
      :item="{
        title: 'Fornecedores',
        icon: 'ri-store-2-line',
        to: '/fornecedores',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Colaboradores',
        icon: 'ri-team-line',
        to: '/colaboradores',
      }"
    />
  </template>

  <!-- 👉 Fiscal & Relatórios (oculto para o corretor) -->
  <template v-if="!appStore.isBroker">
    <VerticalNavSectionTitle :item="{ heading: 'Fiscal & Relatórios' }" />
    <VerticalNavLink
      :item="{
        title: 'Notas Fiscais',
        icon: 'ri-file-text-line',
        to: '/notas-fiscais',
      }"
    />
    <VerticalNavLink
      :item="{
        title: 'Relatórios',
        icon: 'ri-bar-chart-box-line',
        to: '/relatorios',
      }"
    />
  </template>

  <!-- 👉 Sistema -->
  <VerticalNavSectionTitle :item="{ heading: 'Sistema' }" />
  <VerticalNavLink
    :item="{
      title: 'Notificações',
      icon: 'ri-notification-3-line',
      to: '/notificacoes',
      badgeContent: unread ? String(unread) : undefined,
      badgeClass: 'bg-error',
    }"
  />
  <VerticalNavLink
    v-if="appStore.canManageFinance"
    :item="{
      title: 'Importador',
      icon: 'ri-upload-cloud-2-line',
      to: '/importador',
    }"
  />
  <VerticalNavLink
    v-if="appStore.canManageFinance"
    :item="{
      title: 'Auditoria',
      icon: 'ri-history-line',
      to: '/auditoria',
    }"
  />
  <VerticalNavLink
    v-if="!appStore.isBroker"
    :item="{
      title: 'Configurações',
      icon: 'ri-settings-3-line',
      to: '/configuracoes',
    }"
  />
</template>
