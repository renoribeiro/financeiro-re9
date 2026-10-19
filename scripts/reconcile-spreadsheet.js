import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

console.log('=== SPREADSHEET RECONCILIATION ===')

// 1. Entradas (Income)
const entradas = data.Entradas || []

// Row 4 is header: ["Data", "Descrição", "Cliente / Fonte", "Categoria", "Parcela", "Conta Origem", "Valor (R$)", "Status / Data Receb."]
// Let's filter actual data rows
const entradaRows = entradas.slice(3).filter(r => r && r[0] && r[6] !== undefined && typeof r[6] === 'number')

const totalEntradas = entradaRows.reduce((sum, r) => sum + Number(r[6] || 0), 0)

console.log(`Entradas count: ${entradaRows.length}, Total: R$ ${totalEntradas.toFixed(2)}`)
entradaRows.forEach((r, i) => {
  console.log(`  [${i + 1}] ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[5]} | R$ ${r[6]}`)
})

// 2. Saídas (Expenses)
const saidas = data.Saidas || []

// Row 4 is header: ["Data", "Descrição", "Fornecedor / Beneficiário", "Categoria", "Forma Pagto", "Conta Destino", "Valor (R$)", "Status", "Observações"]
const saidaRows = saidas.slice(3).filter(r => r && r[0] && r[6] !== undefined && typeof r[6] === 'number')
const totalSaidas = saidaRows.reduce((sum, r) => sum + Number(r[6] || 0), 0)

console.log(`\nSaídas count: ${saidaRows.length}, Total: R$ ${totalSaidas.toFixed(2)}`)

// 3. Contas a Receber (Pending Receivables)
const recs = data['Contas a Receber'] || []
const recRows = recs.slice(3).filter(r => r && r[0] && r[2] !== undefined && typeof r[2] === 'number')
const totalRecsPending = recRows.reduce((sum, r) => sum + Number(r[2] || 0), 0)

console.log(`\nContas a Receber (Pendente) count: ${recRows.length}, Total: R$ ${totalRecsPending.toFixed(2)}`)
recRows.forEach((r, i) => {
  console.log(`  [${i + 1}] ${r[0]} | ${r[1]} | R$ ${r[2]} | Venc: ${r[4]} | Status: ${r[5]}`)
})

// 4. Contas a Pagar (Pending Payables)
const pays = data['Contas a Pagar'] || []
const payRows = pays.slice(3).filter(r => r && r[0] && r[2] !== undefined && typeof r[2] === 'number')
const totalPaysPending = payRows.reduce((sum, r) => sum + Number(r[2] || 0), 0)

console.log(`\nContas a Pagar (Pendente) count: ${payRows.length}, Total: R$ ${totalPaysPending.toFixed(2)}`)
payRows.forEach((r, i) => {
  console.log(`  [${i + 1}] ${r[0]} | ${r[1]} | R$ ${r[2]} | Venc: ${r[4]} | Status: ${r[5]}`)
})

// 5. Custos Fixos
const fixos = data['Custos Fixos'] || []
const fixoRows = fixos.slice(3).filter(r => r && r[0] && r[1] !== undefined && typeof r[1] === 'number')

console.log(`\nCustos Fixos count: ${fixoRows.length}`)
fixoRows.forEach((r, i) => {
  console.log(`  [${i + 1}] ${r[0]} | R$ ${r[1]} | Venc dia ${r[3]} | Cat: ${r[4]}`)
})
