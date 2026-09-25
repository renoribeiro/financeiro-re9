import assert from 'node:assert/strict'
import {
  calculateCommissionTotal,
  distributeCommission,
  equivalentCommissionPercentage,
} from '../utils/commissionCalculation'

assert.equal(
  calculateCommissionTotal({ mode: 'percentage', saleValue: 350_000, percentage: 4 }),
  14_000,
  'a alíquota da venda deve calcular o total da comissão',
)

assert.equal(
  calculateCommissionTotal({ mode: 'manual_amount', saleValue: 350_000, percentage: 4, manualAmount: 13_500.4 }),
  13_500.4,
  'o valor manual deve prevalecer sobre a alíquota',
)

assert.equal(
  equivalentCommissionPercentage(13_500, 350_000),
  3.857143,
  'a alíquota equivalente deve ser informativa e precisa',
)

assert.deepEqual(
  distributeCommission(100, 3),
  [33.33, 33.33, 33.34],
  'a diferença de centavos deve ficar na última parcela',
)
