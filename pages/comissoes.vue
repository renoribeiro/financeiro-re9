<script setup lang="ts">
import { useFinanceStore } from '@/stores/finance'
import { useAppStore } from '@/stores/app'
import type { Commission } from '@/types/finance'

const finance = useFinanceStore()
const app = useAppStore()

useHead({ title: 'Comissões' })

const rows = computed(() => finance.companyCommissions.map(c => {
  const sale = finance.saleById(c.saleId)
  const insts = finance.installmentsOf(c.id)
  const receivedAmount = insts.filter(i => i.status === 'received').reduce((s, i) => s + i.amount, 0)

  return {
    ...c,
    buyer: sale?.buyerName ?? '—',
    development: finance.developmentName(sale?.developmentId),
    broker: finance.employeeName(sale?.brokerId),
    installments: insts.length,
    receivedAmount,
  }
}))

const totalGenerated = computed(() => rows.value.reduce((s, c) => s + c.totalAmount, 0))
const totalReceived = computed(() => rows.value.reduce((s, c) => s + c.receivedAmount, 0))
const totalPending = computed(() => totalGenerated.value - totalReceived.value)

const totalBrokerPayouts = computed(() =>
  finance.commissionSplits
    .filter(sp => finance.companyCommissions.some(c => c.id === sp.commissionId) && sp.beneficiaryType === 'broker' && sp.status === 'pending')
    .reduce((s, sp) => s + sp.amount, 0),
)

const headers = [
  { title: 'Venda', key: 'buyer' },
  { title: 'Modelo', key: 'receiptType' },
  { title: 'Comissão total', key: 'totalAmount', align: 'end' as const },
  { title: 'Recebido', key: 'receivedAmount', align: 'end' as const },
  { title: 'Parcelas', key: 'installments', align: 'center' as const },
  { title: 'Status', key: 'status' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

// 👉 Detalhe
const dialog = ref(false)
const current = ref<Commission | null>(null)

const detail = computed(() => {
  if (!current.value)
    return null
  const sale = finance.saleById(current.value.saleId)

  return {
    commission: current.value,
    sale,
    installments: finance.installmentsOf(current.value.id),
    splits: finance.splitsOf(current.value.id),
  }
})

function openDetail(c: Commission) {
  current.value = c
  dialog.value = true
}
function receiveInstallment(receivableId?: string) {
  if (receivableId)
    finance.receiveReceivable(receivableId)
}
function paySplit(payableId?: string) {
  if (payableId)
    finance.payPayable(payableId)
}
</script>

<template>
  <div>
    <AppPageHeader
      title="Comissões"
      subtitle="Motor de comissões — recebimentos, parcelas e repasses"
      icon="ri-hand-coin-line"
    />

    <VAlert
      v-if="app.isAgency"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      O motor de comissões é exclusivo da imobiliária.
    </VAlert>

    <template v-else>
      <VRow class="match-height mb-1">
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Comissões geradas"
            :value="formatBRL(totalGenerated)"
            icon="ri-money-dollar-circle-line"
            color="primary"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Recebido"
            :value="formatBRL(totalReceived)"
            icon="ri-checkbox-circle-line"
            color="success"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="A receber"
            :value="formatBRL(totalPending)"
            icon="ri-time-line"
            color="warning"
          />
        </VCol>
        <VCol
          cols="12"
          sm="6"
          lg="3"
        >
          <KpiCard
            title="Repasses a pagar"
            :value="formatBRL(totalBrokerPayouts)"
            icon="ri-share-forward-line"
            color="info"
          />
        </VCol>
      </VRow>

      <VCard>
        <VDataTable
          :headers="headers"
          :items="rows"
          :items-per-page="10"
          item-value="id"
          class="text-no-wrap"
        >
          <template #item.buyer="{ item }">
            <div class="py-2">
              <div class="font-weight-medium">
                {{ item.buyer }}
              </div>
              <div class="text-caption text-disabled">
                {{ item.development }} · {{ item.broker }}
              </div>
            </div>
          </template>
          <template #item.receiptType="{ item }">
            <VChip
              size="small"
              label
              color="secondary"
            >
              {{ receiptTypeLabels[item.receiptType] }}
            </VChip>
          </template>
          <template #item.totalAmount="{ item }">
            <span class="font-weight-medium">{{ formatBRL(item.totalAmount) }}</span>
          </template>
          <template #item.receivedAmount="{ item }">
            {{ formatBRL(item.receivedAmount) }}
          </template>
          <template #item.installments="{ item }">
            {{ item.installments }}
          </template>
          <template #item.status="{ item }">
            <StatusChip
              :value="item.status"
              :map="commissionStatusMeta"
            />
          </template>
          <template #item.actions="{ item }">
            <VBtn
              size="small"
              variant="tonal"
              @click="openDetail(item)"
            >
              Detalhes
            </VBtn>
          </template>
        </VDataTable>
      </VCard>

      <!-- Cenários -->
      <VCard
        title="Como funcionam os cenários de recebimento"
        class="mt-6"
      >
        <VCardText>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <div class="font-weight-medium mb-1">
                <VChip
                  size="small"
                  label
                  color="primary"
                  class="me-1"
                >
                  1
                </VChip> Lançamento c/ repasse
              </div>
              <p class="text-body-2 text-medium-emphasis mb-0">
                A construtora paga a comissão total à RE9 (conta a receber). A RE9 retém sua parte e gera uma conta a pagar ao corretor, executada após o recebimento.
              </p>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="font-weight-medium mb-1">
                <VChip
                  size="small"
                  label
                  color="primary"
                  class="me-1"
                >
                  2
                </VChip> Avulso consolidado
              </div>
              <p class="text-body-2 text-medium-emphasis mb-0">
                A RE9 recebe tudo do comprador (conta a receber) e repassa a parte do corretor (conta a pagar).
              </p>
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <div class="font-weight-medium mb-1">
                <VChip
                  size="small"
                  label
                  color="primary"
                  class="me-1"
                >
                  3
                </VChip> Avulso dividido
              </div>
              <p class="text-body-2 text-medium-emphasis mb-0">
                O comprador paga diretamente cada parte. A RE9 só registra sua parte (conta a receber); a parte do corretor fica como registro informativo, sem conta a pagar.
              </p>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </template>

    <!-- Dialog detalhe -->
    <VDialog
      v-model="dialog"
      max-width="720"
      scrollable
    >
      <VCard v-if="detail">
        <VCardItem>
          <VCardTitle>Comissão — {{ detail.sale?.buyerName }}</VCardTitle>
          <VCardSubtitle>{{ finance.developmentName(detail.sale?.developmentId) }} · {{ receiptTypeLabels[detail.commission.receiptType] }}</VCardSubtitle>
          <template #append>
            <StatusChip
              :value="detail.commission.status"
              :map="commissionStatusMeta"
            />
          </template>
        </VCardItem>
        <VDivider />
        <VCardText>
          <div class="text-overline mb-2">
            Parcelas da comissão (recebimento)
          </div>
          <VTable
            density="compact"
            class="mb-6"
          >
            <thead>
              <tr>
                <th>#</th>
                <th>Valor</th>
                <th>Previsto</th>
                <th>Recebido</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inst in detail.installments"
                :key="inst.id"
              >
                <td>{{ inst.installmentNumber }}</td>
                <td>{{ formatBRL(inst.amount) }}</td>
                <td>{{ formatDate(inst.expectedDate) }}</td>
                <td>{{ formatDate(inst.receivedDate) }}</td>
                <td>
                  <StatusChip
                    :value="inst.status"
                    :map="installmentStatusMeta"
                  />
                </td>
                <td class="text-end">
                  <VBtn
                    v-if="app.canManageFinance && inst.status !== 'received' && inst.receivableId"
                    size="x-small"
                    color="success"
                    variant="tonal"
                    @click="receiveInstallment(inst.receivableId)"
                  >
                    Receber
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>

          <div class="text-overline mb-2">
            Divisão (splits)
          </div>
          <VTable density="compact">
            <thead>
              <tr>
                <th>Beneficiário</th>
                <th>%</th>
                <th>Valor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sp in detail.splits"
                :key="sp.id"
              >
                <td>
                  {{ beneficiaryTypeLabels[sp.beneficiaryType] }}
                  <span
                    v-if="sp.beneficiaryId"
                    class="text-disabled"
                  >· {{ finance.employeeName(sp.beneficiaryId) }}</span>
                </td>
                <td>{{ formatPercent(sp.percentage) }}</td>
                <td>{{ formatBRL(sp.amount) }}</td>
                <td>
                  <StatusChip
                    :value="sp.status"
                    :map="splitStatusMeta"
                  />
                </td>
                <td class="text-end">
                  <VBtn
                    v-if="app.canManageFinance && sp.status === 'pending' && sp.payableId"
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    @click="paySplit(sp.payableId)"
                  >
                    Pagar repasse
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>
        <VDivider />
        <VCardText class="d-flex justify-end">
          <VBtn
            variant="tonal"
            color="secondary"
            @click="dialog = false"
          >
            Fechar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>
