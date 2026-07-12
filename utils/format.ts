// ============================================================================
// Formatadores PT-BR — auto-importados pelo Nuxt (diretório utils/)
// ============================================================================

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dec = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Formata valor como moeda BRL: 1234.5 → "R$ 1.234,50" */
export const formatBRL = (value: number | null | undefined): string =>
  brl.format(Number(value ?? 0))

/** Versão compacta: 1234567 → "R$ 1,2 mi" */
export const formatBRLCompact = (value: number | null | undefined): string => {
  const v = Number(value ?? 0)
  const abs = Math.abs(v)
  if (abs >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000)
    return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`

  return brl.format(v)
}

export const formatNumber = (value: number | null | undefined): string =>
  dec.format(Number(value ?? 0))

/** ISO "2026-06-23" → "23/06/2026" */
export const formatDate = (iso: string | null | undefined): string => {
  if (!iso)
    return '—'
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime()))
    return '—'

  return d.toLocaleDateString('pt-BR')
}

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso)
    return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return '—'

  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** "2026-06-23" → "Jun/2026" */
export const formatMonthYear = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00`)

  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    .replace('.', '')
    .replace(' de ', '/')
}

/** Aplica máscara em CPF/CNPJ */
export const formatDocument = (value: string | null | undefined): string => {
  if (!value)
    return '—'
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11)
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (digits.length === 14)
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')

  return value
}

export const formatPhone = (value: string | null | undefined): string => {
  if (!value)
    return '—'
  const d = value.replace(/\D/g, '')
  if (d.length === 11)
    return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (d.length === 10)
    return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')

  return value
}

export const formatPercent = (value: number | null | undefined): string =>
  `${Number(value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

/** Dias entre hoje e a data informada (negativo = vencida há N dias) */
export const daysUntil = (iso: string | null | undefined): number => {
  if (!iso)
    return 0
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`)
  const today = new Date()

  today.setHours(0, 0, 0, 0)

  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** ISO de hoje (yyyy-mm-dd) — a partir da data LOCAL, não UTC. */
export const todayISO = (): string => {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')

  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Gera um id pseudo-único para entidades criadas no client */
export const uid = (prefix = 'id'): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}`
