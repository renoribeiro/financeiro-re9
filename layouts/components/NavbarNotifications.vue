<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'

const financeStore = useFinanceStore()

const items = computed(() => financeStore.companyNotifications.slice(0, 6))
const unread = computed(() => financeStore.unreadNotificationCount)

const severityIcon: Record<string, string> = {
  success: 'ri-checkbox-circle-line',
  warning: 'ri-error-warning-line',
  error: 'ri-close-circle-line',
  info: 'ri-information-line',
}
</script>

<template>
  <IconBtn aria-label="Notificações">
    <VBadge
      v-if="unread"
      :content="unread"
      color="error"
    >
      <VIcon icon="ri-notification-3-line" />
    </VBadge>
    <VIcon
      v-else
      icon="ri-notification-3-line"
    />

    <VMenu
      activator="parent"
      location="bottom end"
      offset="14"
      :close-on-content-click="false"
    >
      <VCard
        width="360"
        max-width="100vw"
      >
        <VCardItem class="py-3">
          <VCardTitle class="text-base">
            Notificações
          </VCardTitle>
          <template #append>
            <VBtn
              v-if="unread"
              size="small"
              variant="text"
              @click="financeStore.markAllNotificationsRead()"
            >
              Marcar lidas
            </VBtn>
          </template>
        </VCardItem>
        <VDivider />

        <VList
          class="py-0"
          max-height="380"
          style="overflow-y: auto;"
        >
          <template v-if="items.length">
            <template
              v-for="(n, i) in items"
              :key="n.id"
            >
              <VListItem @click="financeStore.markNotificationRead(n.id)">
                <template #prepend>
                  <VAvatar
                    size="36"
                    variant="tonal"
                    :color="n.severity"
                  >
                    <VIcon
                      :icon="severityIcon[n.severity]"
                      size="20"
                    />
                  </VAvatar>
                </template>
                <VListItemTitle class="text-wrap text-body-2 font-weight-medium">
                  {{ n.title }}
                </VListItemTitle>
                <VListItemSubtitle class="text-wrap">
                  {{ n.message }}
                </VListItemSubtitle>
                <template #append>
                  <VBadge
                    v-if="n.status !== 'read'"
                    dot
                    color="primary"
                    inline
                  />
                </template>
              </VListItem>
              <VDivider v-if="i < items.length - 1" />
            </template>
          </template>
          <VListItem
            v-else
            class="text-center text-disabled py-6"
          >
            Nenhuma notificação
          </VListItem>
        </VList>

        <VDivider />
        <VCardText class="pa-2">
          <VBtn
            block
            size="small"
            variant="tonal"
            to="/notificacoes"
          >
            Ver todas
          </VBtn>
        </VCardText>
      </VCard>
    </VMenu>
  </IconBtn>
</template>
