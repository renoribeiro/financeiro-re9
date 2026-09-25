import type { CommissionCalculationMode } from '@/types/finance'

export interface CommissionTerms {
  mode: CommissionCalculationMode
  saleValue: number
  percentage: number
  manualAmount?: number
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value))
    return 0

  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateCommissionTotal(terms: CommissionTerms): number {
  if (terms.mode === 'manual_amount')
    return roundCurrency(Number(terms.manualAmount ?? 0))

  return roundCurrency(Number(terms.saleValue || 0) * Number(terms.percentage || 0) / 100)
}

export function equivalentCommissionPercentage(total: number, saleValue: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(saleValue) || saleValue <= 0)
    return 0

  return Math.round(total * 100_000_000 / saleValue) / 1_000_000
}

export function distributeCommission(total: number, installments: number): number[] {
  const count = Math.max(1, Math.trunc(installments || 1))
  const totalInCents = Math.round(roundCurrency(total) * 100)
  const baseInCents = Math.floor(totalInCents / count)
  const values = Array.from({ length: count }, () => baseInCents / 100)

  values[count - 1] = (totalInCents - baseInCents * (count - 1)) / 100

  return values
}
