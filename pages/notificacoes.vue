<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { AppNotification, NotificationChannel, NotificationRule } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Notificações' })

const tab = ref<'notifications' | 'rules'>('notifications')

// 👉 Avatar por severidade
const severityMeta: Record<AppNotification['severity'], { color: string; icon: string }> = {
  success: { color: 'success', icon: 'ri-checkbox-circle-line' },
  warning: { color: 'warning', icon: 'ri-alert-line' },
  error: { color: 'error', icon: 'ri-error-warning-line' },
  info: { color: 'info', icon: 'ri-information-line' },
}

function onClickNotification(n: AppNotification) {
  if (n.status !== 'read')
    finance.markNotificationRead(n.id)
}

// 👉 Regras
const allChannels: NotificationChannel[] = ['dashboard', 'whatsapp', 'email']

const ruleHeaders = [
  { title: 'Tipo', key: 'label' },
  { title: 'Antecedência', key: 'advanceDays' },
  { title: 'Canais', key: 'channels', sortable: false },
  { title: 'Ativa', key: 'isActive', align: 'end' as const },
]

function toggleActive(rule: NotificationRule, value: boolean) {
  finance.saveNotificationRule({ ...structuredClone(toRaw(rule)), isActive: value })
}

function toggleChannel(rule: NotificationRule, channel: NotificationChannel) {
  if (app.isReadOnly)
    return

  const channels = rule.channels.includes(channel)
    ? rule.channels.filter(c => c !== channel)
    : [...rule.channels, channel]

  finance.saveNotificationRule({ ...structuredClone(toRaw(rule)), channels })
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Notificações"
      subtitle="Avisos do sistema e regras de disparo"
      icon="ri-notification-3-line"
    >
      <template #actions>
        <VBtn
          v-if="tab === 'notifications' && finance.unreadNotificationCount > 0"
          variant="tonal"
          prepend-icon="ri-check-double-line"
          @click="finance.markAllNotificationsRead()"
        >
          Marcar todas como lidas
        </VBtn>
      </template>
    </AppPageHeader>

    <VCard>
      <VTabs
        v-model="tab"
        grow
      >
        <VTab value="notifications">
          <VIcon
            start
            icon="ri-notification-3-line"
          />
          Notificações
          <VChip
            v-if="finance.unreadNotificationCount > 0"
            size="x-small"
            color="primary"
            class="ms-2"
          >
            {{ finance.unreadNotificationCount }}
          </VChip>
        </VTab>
        <VTab value="rules">
          <VIcon
            start
            icon="ri-settings-3-line"
          />
          Regras de notificação
        </VTab>
      </VTabs>

      <VDivider />

      <VWindow v-model="tab">
        <!-- Notificações -->
        <VWindowItem value="notifications">
          <VList lines="three">
            <template
              v-for="(n, i) in finance.companyNotifications"
              :key="n.id"
            >
              <VListItem
                :class="{ 'bg-surface-light': n.status !== 'read' }"
                @click="onClickNotification(n)"
              >
                <template #prepend>
                  <VAvatar
                    :color="severityMeta[n.severity].color"
                    variant="tonal"
                  >
                    <VIcon :icon="severityMeta[n.severity].icon" />
                  </VAvatar>
                </template>

                <VListItemTitle class="font-weight-medium d-flex align-center gap-2">
                  {{ n.title }}
                  <VBadge
                    v-if="n.status !== 'read'"
                    inline
                    dot
                    color="primary"
                  />
                </VListItemTitle>
                <VListItemSubtitle class="mt-1">
                  {{ n.message }}
                </VListItemSubtitle>

                <template #append>
                  <div class="text-end">
                    <VChip
                      size="x-small"
                      label
                      class="mb-1"
                    >
                      {{ channelLabels[n.channel] }}
                    </VChip>
                    <div class="text-caption text-disabled">
                      {{ formatDateTime(n.createdAt) }}
                    </div>
                  </div>
                </template>
              </VListItem>
              <VDivider v-if="i < finance.companyNotifications.length - 1" />
            </template>

            <VListItem v-if="!finance.companyNotifications.length">
              <div class="text-center py-8 text-disabled">
                Nenhuma notificação
              </div>
            </VListItem>
          </VList>
        </VWindowItem>

        <!-- Regras -->
        <VWindowItem value="rules">
          <VDataTable
            :headers="ruleHeaders"
            :items="finance.companyNotificationRules"
            :items-per-page="-1"
            item-value="id"
            class="text-no-wrap"
            hide-default-footer
          >
            <template #item.label="{ item }">
              <span class="font-weight-medium">{{ item.label || notificationTypeLabels[item.type] }}</span>
            </template>

            <template #item.advanceDays="{ item }">
              {{ item.advanceDays != null ? `${item.advanceDays} dias` : '—' }}
            </template>

            <template #item.channels="{ item }">
              <div class="d-flex gap-2 py-2">
                <VChip
                  v-for="channel in allChannels"
                  :key="channel"
                  size="small"
                  label
                  :color="item.channels.includes(channel) ? 'primary' : undefined"
                  :variant="item.channels.includes(channel) ? 'flat' : 'outlined'"
                  :disabled="app.isReadOnly"
                  @click="toggleChannel(item, channel)"
                >
                  {{ channelLabels[channel] }}
                </VChip>
              </div>
            </template>

            <template #item.isActive="{ item }">
              <div class="d-flex justify-end">
                <VSwitch
                  :model-value="item.isActive"
                  color="primary"
                  density="compact"
                  hide-details
                  :disabled="app.isReadOnly"
                  @update:model-value="(v) => toggleActive(item, !!v)"
                />
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8 text-disabled">
                Nenhuma regra configurada
              </div>
            </template>
          </VDataTable>
        </VWindowItem>
      </VWindow>
    </VCard>
  </div>
</template>
