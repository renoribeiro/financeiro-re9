<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { FunnelCard, FunnelStage } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Funil de Vendas' })

const brokerFilter = ref<string | null>(null)
const brokerOptions = computed(() => finance.companyEmployees.filter(e => e.employmentType === 'commission_only').map(e => ({ title: e.fullName, value: e.id })))

// corretor logado (se o perfil atual for corretor) — escopa o funil ao próprio dono
const ownBrokerId = computed(() =>
  finance.companyEmployees.find(e => e.userId === app.currentUserId && e.employmentType === 'commission_only')?.id,
)

const canEditCard = (card: FunnelCard) => !app.isReadOnly && (!app.isBroker || card.brokerId === ownBrokerId.value)

const visibleCards = computed(() =>
  finance.companyFunnel.filter(c => {
    // corretor só enxerga o próprio funil (spec §3.13)
    if (app.isBroker)
      return c.brokerId === ownBrokerId.value

    return !brokerFilter.value || c.brokerId === brokerFilter.value
  }),
)

const columns = computed(() => funnelStages.map(st => ({
  ...st,
  cards: visibleCards.value.filter(c => c.currentStage === st.value),
})))

const cardsByStageValue = (stage: string) => visibleCards.value.filter(c => c.currentStage === stage).reduce((s, c) => s + (c.estimatedValue ?? 0), 0)

function daysInStage(card: FunnelCard) {
  return Math.abs(daysUntil(card.stageEnteredAt.slice(0, 10)))
}

// 👉 Drag & drop nativo
const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)

function onDragStart(ev: DragEvent, card: FunnelCard) {
  if (!canEditCard(card))
    return
  draggingId.value = card.id

  // Firefox exige dataTransfer definido no dragstart, senão o arraste não inicia
  if (ev.dataTransfer) {
    ev.dataTransfer.setData('text/plain', card.id)
    ev.dataTransfer.effectAllowed = 'move'
  }
}
function onDragEnd() {
  draggingId.value = null
  dragOverStage.value = null
}
function onDrop(stage: FunnelStage) {
  if (draggingId.value)
    finance.moveFunnelCard(draggingId.value, stage)
  draggingId.value = null
  dragOverStage.value = null
}

// 👉 Métricas de conversão
const conversion = computed(() => {
  const total = visibleCards.value.length || 1
  const deeds = visibleCards.value.filter(c => c.currentStage === 'deed').length

  return {
    total: visibleCards.value.length,
    closeRate: Math.round((deeds / total) * 100),
    pipelineValue: visibleCards.value.reduce((s, c) => s + (c.estimatedValue ?? 0), 0),
  }
})

// 👉 Conversão por estágio: % que chegou ao estágio (cumulativo) + tempo médio
const stageMetrics = computed(() => {
  const order = funnelStages.map(s => s.value)
  const idx = (stage: string) => order.indexOf(stage)
  const totalLeads = visibleCards.value.length || 1

  return funnelStages.map((st, i) => {
    // "chegou ao estágio" = card cujo estágio atual é este ou posterior
    const reached = visibleCards.value.filter(c => idx(c.currentStage) >= i)
    const here = visibleCards.value.filter(c => c.currentStage === st.value)

    const avgDays = here.length
      ? Math.round(here.reduce((s, c) => s + Math.abs(daysUntil(c.stageEnteredAt.slice(0, 10))), 0) / here.length)
      : 0

    return {
      ...st,
      here: here.length,
      reachedRate: Math.round((reached.length / totalLeads) * 100),
      avgDays,
    }
  })
})

// 👉 Novo lead
const dialog = ref(false)
const editing = ref<Partial<FunnelCard>>({})
const devOptions = computed(() => finance.companyDevelopments.map(d => ({ title: d.name, value: d.id })))
function openNew() {
  // corretor cria leads já atribuídos a si mesmo
  editing.value = { currentStage: 'lead', brokerId: app.isBroker ? ownBrokerId.value : undefined }
  dialog.value = true
}
function openEdit(c: FunnelCard) {
  // corretor não abre/edita cards de outros corretores
  if (app.isBroker && c.brokerId !== ownBrokerId.value)
    return
  editing.value = structuredClone(toRaw(c))
  dialog.value = true
}
function save() {
  // lead exige ao menos o nome do contato
  if (!editing.value.contactName?.trim())
    return
  finance.saveFunnelCard(editing.value)
  dialog.value = false
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Funil de Vendas"
      subtitle="Pipeline visual — arraste os cards entre estágios"
      icon="ri-filter-3-line"
    >
      <template #actions>
        <VSelect
          v-if="!app.isBroker"
          v-model="brokerFilter"
          :items="brokerOptions"
          label="Corretor"
          density="compact"
          variant="outlined"
          style="max-inline-size: 200px;"
          hide-details
          clearable
        />
        <VBtn
          v-if="!app.isReadOnly"
          prepend-icon="ri-add-line"
          @click="openNew"
        >
          Novo lead
        </VBtn>
      </template>
    </AppPageHeader>

    <VAlert
      v-if="app.isAgency"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      O funil de vendas é exclusivo da imobiliária.
    </VAlert>

    <template v-else>
      <VRow class="match-height mb-1">
        <VCol
          cols="12"
          sm="4"
        >
          <KpiCard
            title="Leads no funil"
            :value="String(conversion.total)"
            icon="ri-user-search-line"
            color="info"
          />
        </VCol>
        <VCol
          cols="12"
          sm="4"
        >
          <KpiCard
            title="Valor em pipeline"
            :value="formatBRLCompact(conversion.pipelineValue)"
            icon="ri-funds-line"
            color="primary"
          />
        </VCol>
        <VCol
          cols="12"
          sm="4"
        >
          <KpiCard
            title="Taxa de fechamento"
            :value="`${conversion.closeRate}%`"
            icon="ri-percent-line"
            color="success"
          />
        </VCol>
      </VRow>

      <!-- Conversão por estágio -->
      <VCard
        title="Conversão por estágio"
        class="mb-4"
      >
        <VCardText>
          <VRow>
            <VCol
              v-for="m in stageMetrics"
              :key="m.value"
              cols="6"
              md="auto"
              class="flex-grow-1 text-center"
            >
              <VChip
                :color="m.color"
                size="small"
                label
                class="mb-2"
              >
                {{ m.label }}
              </VChip>
              <div class="text-h6">
                {{ m.reachedRate }}%
              </div>
              <div class="text-caption text-disabled">
                {{ m.here }} aqui · ~{{ m.avgDays }}d no estágio
              </div>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Kanban -->
      <div class="kanban d-flex gap-4 pb-3">
        <div
          v-for="col in columns"
          :key="col.value"
          class="kanban-col"
          :class="{ 'kanban-col--over': dragOverStage === col.value }"
          @dragover.prevent="dragOverStage = col.value"
          @dragleave="dragOverStage = null"
          @drop="onDrop(col.value as FunnelStage)"
        >
          <div class="d-flex align-center justify-space-between mb-3 px-1">
            <div class="d-flex align-center gap-2">
              <VChip
                :color="col.color"
                size="small"
                label
              >
                {{ col.label }}
              </VChip>
              <span class="text-caption text-disabled">{{ col.cards.length }}</span>
            </div>
            <span class="text-caption font-weight-medium">{{ formatBRLCompact(cardsByStageValue(col.value)) }}</span>
          </div>

          <div
            v-for="card in col.cards"
            :key="card.id"
            class="mb-3"
            :draggable="canEditCard(card)"
            @dragstart="onDragStart($event, card)"
            @dragend="onDragEnd"
          >
            <VCard
              variant="outlined"
              class="kanban-card"
              :class="{ 'kanban-card--dragging': draggingId === card.id }"
              @click="openEdit(card)"
            >
              <VCardText class="pa-3">
                <div class="d-flex align-center justify-space-between mb-1">
                  <span class="font-weight-medium">{{ card.contactName }}</span>
                  <VIcon
                    v-if="canEditCard(card)"
                    icon="ri-draggable"
                    size="16"
                    class="text-disabled"
                  />
                </div>
                <div class="text-caption text-disabled mb-2">
                  {{ finance.developmentName(card.developmentId) }}
                </div>
                <div class="d-flex align-center justify-space-between">
                  <span class="text-body-2 font-weight-medium text-primary">{{ formatBRLCompact(card.estimatedValue ?? 0) }}</span>
                  <VChip
                    size="x-small"
                    label
                    color="secondary"
                  >
                    {{ daysInStage(card) }}d
                  </VChip>
                </div>
                <div class="text-caption text-disabled mt-1">
                  <VIcon
                    icon="ri-user-line"
                    size="12"
                  /> {{ finance.employeeName(card.brokerId) }}
                </div>
              </VCardText>
            </VCard>
          </div>

          <div
            v-if="!col.cards.length"
            class="text-center text-disabled text-caption py-4"
          >
            Sem cards
          </div>
        </div>
      </div>
    </template>

    <!-- Dialog lead -->
    <VDialog
      v-model="dialog"
      max-width="560"
      persistent
    >
      <VCard>
        <VCardItem>
          <VCardTitle>{{ editing.id ? 'Editar lead' : 'Novo lead' }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="editing.contactName"
                label="Nome do contato"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model="editing.contactPhone"
                label="Telefone"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="editing.developmentId"
                label="Empreendimento"
                :items="devOptions"
                clearable
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="editing.brokerId"
                label="Corretor"
                :items="brokerOptions"
                clearable
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VTextField
                v-model.number="editing.estimatedValue"
                label="Valor estimado (R$)"
                type="number"
                prefix="R$"
              />
            </VCol>
            <VCol
              cols="12"
              md="6"
            >
              <VSelect
                v-model="editing.currentStage"
                label="Estágio"
                :items="funnelStages.map(s => ({ title: s.label, value: s.value }))"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="editing.notes"
                label="Observações"
                rows="2"
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText class="d-flex justify-end gap-3 pt-0">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="dialog = false"
          >
            Cancelar
          </VBtn>
          <VBtn @click="save">
            Salvar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.kanban {
  overflow-x: auto;
}

.kanban-col {
  min-inline-size: 264px;
  inline-size: 264px;
  padding: 0.5rem;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  transition: background-color 0.2s ease;

  &--over {
    background-color: rgba(var(--v-theme-primary), 0.12);
    outline: 2px dashed rgba(var(--v-theme-primary), 0.4);
  }
}

.kanban-card {
  cursor: grab;

  &--dragging {
    opacity: 0.5;
  }
}
</style>
