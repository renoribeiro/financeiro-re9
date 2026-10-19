import fs from 'node:fs'

const normalized = JSON.parse(fs.readFileSync('docs/migracao/parsed_normalized.json', 'utf8'))
const sheetData = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

const CID = 'e11042be-3d22-4048-9380-ac71e8dc9252' // RE9 Imóveis Ltda

function sqlEsc(val) {
  if (val === null || val === undefined)
    return 'NULL'
  if (typeof val === 'number')
    return String(val)
  if (typeof val === 'boolean')
    return val ? 'TRUE' : 'FALSE'

  return `'${String(val).replace(/'/g, '\'\'')}'`
}

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)

    return v.toString(16)
  })
}

// 1. Build Suppliers map
const supplierNames = [...new Set(normalized.saidas.map(s => s.beneficiaryName).filter(Boolean))]
const supplierMap = new Map()

supplierNames.forEach(name => supplierMap.set(name, genUUID()))

const statements = []

statements.push('ALTER TABLE payables DISABLE TRIGGER USER;')
statements.push('ALTER TABLE receivables DISABLE TRIGGER USER;')

// Suppliers
supplierNames.forEach(name => {
  const id = supplierMap.get(name)

  statements.push(`INSERT INTO suppliers (id, company_id, legal_name, trade_name, is_active) VALUES ('${id}', '${CID}', ${sqlEsc(name)}, ${sqlEsc(name)}, TRUE) ON CONFLICT DO NOTHING;`)
})

// 2. Entradas (19 received income transactions)
normalized.entradas.forEach(e => {
  const recId = genUUID()
  const transId = genUUID()
  const setId = genUUID()
  const dateStr = e.date

  statements.push(`INSERT INTO receivables (id, company_id, description, client_name, amount, due_date, status, received_at, received_amount, notes) VALUES ('${recId}', '${CID}', ${sqlEsc(e.description)}, ${sqlEsc(e.clientName)}, ${e.amount}, ${sqlEsc(dateStr)}, 'received', ${sqlEsc(dateStr)}, ${e.amount}, ${sqlEsc(e.notes)});`)
  statements.push(`INSERT INTO settlements (id, company_id, receivable_id, amount, settled_at) VALUES ('${setId}', '${CID}', '${recId}', ${e.amount}, ${sqlEsc(dateStr)});`)
  statements.push(`INSERT INTO transactions (id, company_id, type, amount, date, description, receivable_id, settlement_id, payment_method) VALUES ('${transId}', '${CID}', 'income', ${e.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(e.description)}, '${recId}', '${setId}', 'Pix');`)
})

// 3. Saídas (114 paid expense transactions)
normalized.saidas.forEach(s => {
  const payId = genUUID()
  const transId = genUUID()
  const setId = genUUID()
  const dateStr = s.date
  const suppId = supplierMap.get(s.beneficiaryName) || null

  statements.push(`INSERT INTO payables (id, company_id, description, supplier_id, amount, due_date, status, paid_at, paid_amount, notes) VALUES ('${payId}', '${CID}', ${sqlEsc(s.description)}, ${suppId ? sqlEsc(suppId) : 'NULL'}, ${s.amount}, ${sqlEsc(dateStr)}, 'paid', ${sqlEsc(dateStr)}, ${s.amount}, ${sqlEsc(s.proof)});`)
  statements.push(`INSERT INTO settlements (id, company_id, payable_id, amount, settled_at, proof_url) VALUES ('${setId}', '${CID}', '${payId}', ${s.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(s.proof)});`)
  statements.push(`INSERT INTO transactions (id, company_id, type, amount, date, description, payable_id, settlement_id, payment_method, proof_url) VALUES ('${transId}', '${CID}', 'expense', ${s.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(s.description)}, '${payId}', '${setId}', ${sqlEsc(s.paymentMethod)}, ${sqlEsc(s.proof)});`)
})

// 4. Pending Receivables & Payables
normalized.receivables.filter(r => r.status === 'open').forEach(r => {
  const recId = genUUID()

  statements.push(`INSERT INTO receivables (id, company_id, description, client_name, amount, due_date, status, notes) VALUES ('${recId}', '${CID}', ${sqlEsc(r.description)}, ${sqlEsc(r.clientName)}, ${r.amount}, ${sqlEsc(r.dueDate)}, 'open', ${sqlEsc(r.notes)});`)
})

normalized.payables.filter(p => p.status === 'open').forEach(p => {
  const payId = genUUID()
  const suppId = supplierMap.get(p.supplierName) || null

  statements.push(`INSERT INTO payables (id, company_id, description, supplier_id, amount, due_date, status, notes) VALUES ('${payId}', '${CID}', ${sqlEsc(p.description)}, ${suppId ? sqlEsc(suppId) : 'NULL'}, ${p.amount}, ${sqlEsc(p.dueDate)}, 'open', ${sqlEsc(p.notes)});`)
})

// 5. Comissões & Vendas
const comissRaw = sheetData.Comissoes || []
const comissRows = comissRaw.slice(3).filter(r => r && r[0] && r[5] !== undefined && typeof r[5] === 'number')

comissRows.forEach(c => {
  const buyerName = String(c[1] || '').trim()
  const grossComm = Number(c[5] || 0)
  const netComm = Number(c[7] || grossComm)
  const re9Comm = Number(c[9] || netComm)
  const isReceived = String(c[11] || '').trim().toLowerCase() === 'sim'

  const saleId = genUUID()
  const commId = genUUID()

  statements.push(`INSERT INTO sales (id, company_id, buyer_name, sale_value, sale_date, status) VALUES ('${saleId}', '${CID}', ${sqlEsc(buyerName)}, ${Number(c[3] || 0)}, '2026-05-01', ${isReceived ? '\'settled\'' : '\'active\''});`)
  statements.push(`INSERT INTO commissions (id, company_id, sale_id, total_amount, status) VALUES ('${commId}', '${CID}', '${saleId}', ${re9Comm}, ${isReceived ? '\'received\'' : '\'pending\''});`)
})

statements.push('ALTER TABLE payables ENABLE TRIGGER USER;')
statements.push('ALTER TABLE receivables ENABLE TRIGGER USER;')

fs.writeFileSync('docs/migracao/statements.json', JSON.stringify(statements, null, 2))
console.log(`Generated ${statements.length} SQL statements.`)
