// ============================================================================
// Testes de lógica pura dos filtros de data. Rodáveis via:
//   npx tsx tests/dateFilter.test.ts
// ============================================================================

import { buildMonthOptions, inMonth, isWithin, monthKey, presetWindow } from '../utils/dateFilter'

let passed = 0
let failed = 0

function assert(name: string, cond: boolean) {
  if (cond) {
    passed++
  }
  else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

// ---- monthKey ---------------------------------------------------------------
assert('monthKey extrai YYYY-MM', monthKey('2026-07-13') === '2026-07')
assert('monthKey lida com ISO datetime', monthKey('2026-01-05T10:20:00.000Z') === '2026-01')

// ---- inMonth ----------------------------------------------------------------
assert('inMonth "all" aceita tudo', inMonth('2026-07-13', 'all'))
assert('inMonth casa mês certo', inMonth('2026-07-13', '2026-07'))
assert('inMonth rejeita mês diferente', !inMonth('2026-06-30', '2026-07'))
assert('inMonth rejeita vazio', !inMonth(undefined, '2026-07'))

// ---- buildMonthOptions ------------------------------------------------------
const opts = buildMonthOptions(['2026-05-29', '2026-07-11', '2026-06-23', '2026-07-01', null, undefined])
assert('buildMonthOptions começa com "Todos os meses"', opts[0]?.value === 'all')
assert('buildMonthOptions deduplica meses (3 meses + all = 4)', opts.length === 4)
assert('buildMonthOptions ordena do mais recente ao mais antigo', opts[1]?.value === '2026-07' && opts[2]?.value === '2026-06' && opts[3]?.value === '2026-05')

// ---- presetWindow -----------------------------------------------------------
const w7 = presetWindow('7d', '2026-07-13')
assert('presetWindow 7d termina hoje', w7.end === '2026-07-13')
assert('presetWindow 7d começa 6 dias antes (7 dias corridos)', w7.start === '2026-07-07')
const w30 = presetWindow('30d', '2026-07-13')
assert('presetWindow 30d começa 29 dias antes', w30.start === '2026-06-14')
assert('presetWindow all sem limites', presetWindow('all').start === null && presetWindow('all').end === null)
assert('presetWindow custom sem limites', presetWindow('custom').start === null && presetWindow('custom').end === null)

// ---- isWithin ---------------------------------------------------------------
assert('isWithin sem janela aceita tudo', isWithin('2020-01-01', { start: null, end: null }))
assert('isWithin dentro do intervalo', isWithin('2026-07-10', { start: '2026-07-07', end: '2026-07-13' }))
assert('isWithin inclui limite inicial', isWithin('2026-07-07', { start: '2026-07-07', end: '2026-07-13' }))
assert('isWithin inclui limite final', isWithin('2026-07-13', { start: '2026-07-07', end: '2026-07-13' }))
assert('isWithin exclui antes do início', !isWithin('2026-07-06', { start: '2026-07-07', end: '2026-07-13' }))
assert('isWithin exclui depois do fim', !isWithin('2026-07-14', { start: '2026-07-07', end: '2026-07-13' }))
assert('isWithin só-fim funciona', isWithin('2026-01-01', { start: null, end: '2026-07-13' }))
assert('isWithin lida com datetime', isWithin('2026-07-10T23:59:00Z', { start: '2026-07-07', end: '2026-07-13' }))

console.log(`\nDateFilter: ${passed} passaram, ${failed} falharam.`)
if (failed > 0)
  process.exit(1)
