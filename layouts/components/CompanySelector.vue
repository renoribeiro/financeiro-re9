<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useAppStore } from '@/stores/app'
import { resolveRouteRedirect } from '@/utils/routeAccess'

const appStore = useAppStore()
const route = useRoute()
const { xs } = useDisplay()
const companyIcon = computed(() => appStore.isRealEstate ? 'ri-building-line' : 'ri-megaphone-line')

const switched = ref(false)

async function selectCompany(id: string) {
  if (id === appStore.currentCompanyId)
    return
  appStore.setCompany(id)
  if (appStore.currentCompanyId !== id)
    return
  switched.value = true

  // A página aberta pode não existir para a nova empresa/perfil (ex.: Vendas
  // numa agência): reavalia as regras de acesso e redireciona se preciso.
  const target = resolveRouteRedirect(route.path, appStore)
  if (target && target !== route.path)
    await navigateTo(target)
}
</script>

<template>
  <VBtn
    variant="tonal"
    color="default"
    class="company-selector text-none"
    :prepend-icon="xs ? undefined : companyIcon"
    :append-icon="xs ? undefined : 'ri-arrow-down-s-line'"
    :aria-label="`Empresa atual: ${appStore.currentCompany.tradeName}. Trocar de empresa`"
  >
    <span class="company-selector__name text-truncate">{{ appStore.currentCompany.tradeName }}</span>

    <VMenu
      activator="parent"
      location="bottom end"
      offset="8"
    >
      <VList
        class="company-selector__menu"
        density="comfortable"
      >
        <VListSubheader>Empresas</VListSubheader>
        <VListItem
          v-for="company in appStore.availableCompanies"
          :key="company.id"
          :active="company.id === appStore.currentCompanyId"
          @click="selectCompany(company.id)"
        >
          <template #prepend>
            <VAvatar
              size="34"
              rounded
              variant="tonal"
              :color="company.logoColor"
            >
              <VIcon :icon="company.type === 'real_estate' ? 'ri-building-line' : 'ri-megaphone-line'" />
            </VAvatar>
          </template>
          <VListItemTitle class="font-weight-medium">
            {{ company.tradeName }}
          </VListItemTitle>
          <VListItemSubtitle>{{ company.type === 'real_estate' ? 'Imobiliária' : 'Agência' }}</VListItemSubtitle>
          <template #append>
            <VIcon
              v-if="company.id === appStore.currentCompanyId"
              icon="ri-check-line"
              color="primary"
            />
          </template>
        </VListItem>
      </VList>
    </VMenu>
  </VBtn>

  <VSnackbar
    v-model="switched"
    :timeout="4000"
    location="bottom"
    color="primary"
  >
    Agora você está em <strong>{{ appStore.currentCompany.tradeName }}</strong>.
  </VSnackbar>
</template>

<style lang="scss" scoped>
.company-selector {
  max-inline-size: min(18rem, 35vw);
}

.company-selector__menu {
  inline-size: min(17.5rem, calc(100vw - 1.5rem));
}

@media (max-width: 599.98px) {
  // No celular o nome continua visível (curto), em vez de só um ícone:
  // é onde o risco de operar na empresa errada é maior.
  .company-selector {
    block-size: 2.75rem !important;
    max-inline-size: 7.5rem;
    padding-inline: 0.625rem !important;
  }

  .company-selector__name {
    font-size: 0.8125rem;
  }
}
</style>
