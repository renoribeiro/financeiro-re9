import type { Development } from '@/types/finance'

export const DEFAULT_DEVELOPMENT_COMMISSION_PERCENTAGE = 4
export const DEFAULT_BROKER_SPLIT_PERCENTAGE = 2

export function createDevelopmentDraft(source?: Partial<Development> | null): Partial<Development> {
  if (source)
    return { ...source }

  return {
    type: 'launch',
    commissionPercentage: DEFAULT_DEVELOPMENT_COMMISSION_PERCENTAGE,
    brokerSplitPercentage: DEFAULT_BROKER_SPLIT_PERCENTAGE,
    isActive: true,
  }
}
