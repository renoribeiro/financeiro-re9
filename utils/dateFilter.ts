// ============================================================================
// Filtros de data — lógica pura, auto-importada pelo Nuxt (diretório utils/).
// Usado pelos filtros de período (Vendas/Comissões) e de mês (Contas a
// Pagar/Receber). Trabalha sempre com a porção de data (YYYY-MM-DD) para
// comparações inclusivas e independentes de fuso.
// ============================================================================
import { formatMonthYear, todayISO } from './format'

/** Janela de datas normalizada (inclusiva). null = sem limite. */
export interface DateWindow {
  start: string | null
  end: string | null
}

/** Presets de período rápidos. */
export type PeriodPreset = 'all' | '7d' | '15d' | '30d' | 'custom'

/** Só a data (YYYY-MM-DD) de um ISO qualquer. */
export const dateOnly = (iso: string): string => iso.slice(0, 10)

/** ISO → chave de mês 'YYYY-MM'. */
export const monthKey = (iso: string): string => iso.slice(0, 7)

/**
 * Monta as opções do filtro de mês a partir das datas presentes nos dados.
 * Retorna "Todos os meses" + um item por mês, do mais recente ao mais antigo.
 */
export function buildMonthOptions(dates: Array<string | null | undefined>): Array<{ title: string; value: string }> {
  const keys = Array.from(new Set(
    dates.filter((d): d is string => Boolean(d)).map(monthKey),
  )).sort().reverse()

  return [
    { title: 'Todos os meses', value: 'all' },
    ...keys.map(k => ({ title: formatMonthYear(`${k}-01`), value: k })),
  ]
}

/** Testa se a data do ISO pertence ao mês 'YYYY-MM' (ou 'all'). */
export function inMonth(iso: string | null | undefined, key: string): boolean {
  if (key === 'all')
    return true
  if (!iso)
    return false

  return monthKey(iso) === key
}

/**
 * Converte um preset em janela {start,end} inclusiva, com base em `hoje`
 * (padrão: data local de hoje). Ex.: '7d' = [hoje-6, hoje] (7 dias corridos).
 */
export function presetWindow(preset: PeriodPreset, today = todayISO()): DateWindow {
  if (preset === 'all' || preset === 'custom')
    return { start: null, end: null }

  const days = preset === '7d' ? 7 : preset === '15d' ? 15 : 30
  const end = new Date(`${today}T00:00:00`)
  const start = new Date(end)

  start.setDate(start.getDate() - (days - 1))

  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  return { start: fmt(start), end: fmt(end) }
}

/** Testa se a data do ISO está dentro da janela (limites inclusivos). */
export function isWithin(iso: string | null | undefined, win: DateWindow): boolean {
  if (!win.start && !win.end)
    return true
  if (!iso)
    return false
  const d = dateOnly(iso)
  if (win.start && d < win.start)
    return false
  if (win.end && d > win.end)
    return false

  return true
}
