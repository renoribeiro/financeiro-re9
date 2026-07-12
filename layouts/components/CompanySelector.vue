<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <VBtn
    variant="tonal"
    color="default"
    class="text-none"
    :prepend-icon="appStore.isRealEstate ? 'ri-building-line' : 'ri-megaphone-line'"
    append-icon="ri-arrow-down-s-line"
  >
    <span class="d-none d-sm-inline">{{ appStore.currentCompany.tradeName }}</span>
    <span class="d-sm-none">Empresa</span>

    <VMenu
      activator="parent"
      location="bottom end"
      offset="8"
    >
      <VList
        width="280"
        density="comfortable"
      >
        <VListSubheader>Empresas</VListSubheader>
        <VListItem
          v-for="company in appStore.availableCompanies"
          :key="company.id"
          :active="company.id === appStore.currentCompanyId"
          @click="appStore.setCompany(company.id)"
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
</template>
