import fs from 'node:fs'

const rawData = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

function excelSerialToISO(serial) {
  if (!serial)
    return new Date().toISOString().slice(0, 10)
  if (typeof serial === 'string') {
    if (serial.includes('/')) {
      const parts = serial.split('/')
      if (parts.length === 3)
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
    if (serial.includes('-'))
      return serial
  }
  const s = Number(serial)
  if (isNaN(s))
    return new Date().toISOString().slice(0, 10)
  const utcDays = Math.floor(s - 25569)
  const utcValue = utcDays * 86400 * 1000

  return new Date(utcValue).toISOString().slice(0, 10)
}

const companyId = 'e11042be-3d22-4048-9380-ac71e8dc9252' // RE9 Imóveis Ltda

// 1. Entradas (Income Received)
const entradasRaw = rawData.Entradas || []

const entradaRows = entradasRaw.slice(3).filter(r => {
  if (!r || !r[0] || r[6] === undefined || typeof r[6] !== 'number')
    return false
  const desc = String(r[1] || r[0] || '').toUpperCase()

  return !desc.includes('TOTAL')
})

const parsedEntradas = entradaRows.map((r, i) => {
  return {
    date: excelSerialToISO(r[0]),
    description: String(r[1] || '').trim(),
    clientName: String(r[2] || '').trim(),
    categoryName: String(r[3] || '').trim() || 'Comissão',
    accountName: String(r[5] || '').trim() || 'C6 — RE9 Imob',
    amount: Number(r[6]),
    notes: String(r[7] || '').trim(),
  }
})

// 2. Saidas (Expense Paid)
const saidasRaw = rawData.Saidas || []

const saidaRows = saidasRaw.slice(3).filter(r => {
  if (!r || !r[0] || r[5] === undefined || typeof r[5] !== 'number')
    return false
  const desc = String(r[1] || r[0] || '').toUpperCase()

  return !desc.includes('TOTAL')
})

const parsedSaidas = saidaRows.map((r, i) => {
  return {
    date: excelSerialToISO(r[0]),
    description: String(r[1] || '').trim(),
    beneficiaryName: String(r[2] || '').trim(),
    categoryName: String(r[3] || '').trim() || 'Outros',
    paymentMethod: String(r[4] || '').trim() || 'Pix',
    amount: Number(r[5]),
    proof: String(r[6] || '').trim(),
  }
})

// 3. Contas a Receber
const recsRaw = rawData['Contas a Receber'] || []

const recRows = recsRaw.slice(3).filter(r => {
  if (!r || !r[0] || r[2] === undefined || typeof r[2] !== 'number')
    return false
  const desc = String(r[0] || '').toUpperCase()

  return !desc.includes('TOTAL')
})

const parsedReceivables = recRows.map((r, i) => {
  const statusStr = String(r[5] || '').trim().toLowerCase()

  return {
    description: String(r[0] || '').trim(),
    clientName: String(r[1] || '').trim(),
    amount: Number(r[2]),
    dueDate: excelSerialToISO(r[4]),
    status: statusStr.includes('recebido') || statusStr === 'pago' ? 'received' : 'open',
    receivedAt: statusStr.includes('recebido') || statusStr === 'pago' ? excelSerialToISO(r[6] || r[4]) : null,
    notes: String(r[7] || '').trim(),
  }
})

// 4. Contas a Pagar
const paysRaw = rawData['Contas a Pagar'] || []

const payRows = paysRaw.slice(3).filter(r => {
  if (!r || !r[0] || r[3] === undefined || typeof r[3] !== 'number')
    return false
  const desc = String(r[0] || '').toUpperCase()

  return !desc.includes('TOTAL')
})

const parsedPayables = payRows.map((r, i) => {
  const statusStr = String(r[6] || '').trim().toLowerCase()

  return {
    description: String(r[0] || '').trim(),
    supplierName: String(r[1] || '').trim(),
    categoryName: String(r[2] || '').trim() || 'Comissão',
    amount: Number(r[3]),
    dueDate: excelSerialToISO(r[4]),
    paymentMethod: String(r[5] || '').trim() || 'Pix',
    status: statusStr === 'pago' ? 'paid' : 'open',
    paidAt: statusStr === 'pago' ? excelSerialToISO(r[7] || r[4]) : null,
    notes: String(r[8] || '').trim(),
  }
})

// 5. Custos Fixos
const fixosRaw = rawData['Custos Fixos'] || []

const fixoRows = fixosRaw.slice(3).filter(r => {
  if (!r || !r[0] || r[1] === undefined || typeof r[1] !== 'number')
    return false
  const desc = String(r[0] || '').toUpperCase()

  return !desc.includes('TOTAL') && !desc.includes('CONFIGURACOES') && !desc.includes('ALIQUOTA') && !desc.includes('PROVISAO')
})

const parsedCustosFixos = fixoRows.map(r => ({
  description: String(r[0] || '').trim(),
  monthlyAmount: Number(r[1]),
  dueDay: Number(r[3] || 1),
  categoryName: String(r[4] || '').trim(),
  notes: String(r[5] || '').trim(),
}))

const totals = {
  entradas: parsedEntradas.reduce((s, x) => s + x.amount, 0),
  saidas: parsedSaidas.reduce((s, x) => s + x.amount, 0),
  receivablesAll: parsedReceivables.reduce((s, x) => s + x.amount, 0),
  receivablesPending: parsedReceivables.filter(x => x.status === 'open').reduce((s, x) => s + x.amount, 0),
  payablesAll: parsedPayables.reduce((s, x) => s + x.amount, 0),
  payablesPending: parsedPayables.filter(x => x.status === 'open').reduce((s, x) => s + x.amount, 0),
  custosFixos: parsedCustosFixos.reduce((s, x) => s + x.monthlyAmount, 0),
}

console.log('=== RECONCILED SHEET TOTALS ===')
console.log(`Entradas (${parsedEntradas.length}): R$ ${totals.entradas.toFixed(2)}`)
console.log(`Saídas (${parsedSaidas.length}): R$ ${totals.saidas.toFixed(2)}`)
console.log(`Lucro Líquido Realizado: R$ ${(totals.entradas - totals.saidas).toFixed(2)}`)
console.log(`Contas a Receber Pendentes (${parsedReceivables.filter(x => x.status === 'open').length}): R$ ${totals.receivablesPending.toFixed(2)}`)
console.log(`Contas a Pagar Pendentes (${parsedPayables.filter(x => x.status === 'open').length}): R$ ${totals.payablesPending.toFixed(2)}`)
console.log(`Saldo Previsto: R$ ${(totals.receivablesPending - totals.payablesPending).toFixed(2)}`)
console.log(`Custos Fixos (${parsedCustosFixos.length}): R$ ${totals.custosFixos.toFixed(2)}/mês`)

fs.writeFileSync('docs/migracao/parsed_normalized.json', JSON.stringify({
  entradas: parsedEntradas,
  saidas: parsedSaidas,
  receivables: parsedReceivables,
  payables: parsedPayables,
  custosFixos: parsedCustosFixos,
  totals,
}, null, 2))
