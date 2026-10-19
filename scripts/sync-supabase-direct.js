import fs from 'node:fs'
import crypto from 'node:crypto'

const normalized = JSON.parse(fs.readFileSync('docs/migracao/parsed_normalized.json', 'utf8'))
const sheetData = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

const CID = 'e11042be-3d22-4048-9380-ac71e8dc9252' // RE9 Imóveis Ltda
const UID = 'f1754497-6d06-4e7d-8a82-e4869472d7d7' // reno@re9.online

function sqlEsc(val) {
  if (val === null || val === undefined)
    return 'NULL'
  if (typeof val === 'number')
    return String(val)
  if (typeof val === 'boolean')
    return val ? 'TRUE' : 'FALSE'

  return `'${String(val).replace(/'/g, '\'\'')}'`
}

function mapPaymentMethod(pm) {
  if (!pm)
    return 'pix'
  const lower = String(pm).toLowerCase()
  if (lower.includes('pix'))
    return 'pix'
  if (lower.includes('cart') || lower.includes('card'))
    return 'card'
  if (lower.includes('transf'))
    return 'transfer'
  if (lower.includes('bol'))
    return 'boleto'
  if (lower.includes('dinh') || lower.includes('cash'))
    return 'cash'
  if (lower.includes('cheq'))
    return 'check'

  return 'other'
}

function toUUID(str) {
  const hash = crypto.createHash('md5').update(str).digest('hex')

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

const supplierNames = [...new Set(normalized.saidas.map(s => s.beneficiaryName).filter(Boolean))]
const supplierMap = new Map()

supplierNames.forEach(name => supplierMap.set(name, toUUID(`supplier:${name}`)))

const cleanupStmts = [
  `DELETE FROM transactions WHERE company_id = '${CID}';`,
  `DELETE FROM settlements WHERE company_id = '${CID}';`,
  `DELETE FROM payables WHERE company_id = '${CID}';`,
  `DELETE FROM receivables WHERE company_id = '${CID}';`,
  `DELETE FROM commissions WHERE company_id = '${CID}';`,
  `DELETE FROM sales WHERE company_id = '${CID}';`,
]

const supplierStmts = []

supplierNames.forEach(name => {
  const id = supplierMap.get(name)

  supplierStmts.push(`INSERT INTO suppliers (id, company_id, legal_name, trade_name, is_active) VALUES ('${id}', '${CID}', ${sqlEsc(name)}, ${sqlEsc(name)}, TRUE) ON CONFLICT (id) DO NOTHING;`)
})

const receivableStmts = []
const payableStmts = []
const settlementStmts = []
const transactionStmts = []
const saleStmts = []
const commissionStmts = []

// 2. Entradas (19 received income)
normalized.entradas.forEach((e, idx) => {
  const recId = toUUID(`rec:entrada:${idx}`)
  const transId = toUUID(`trans:entrada:${idx}`)
  const setId = toUUID(`set:entrada:${idx}`)
  const dateStr = e.date

  receivableStmts.push(`INSERT INTO receivables (id, company_id, description, client_name, amount, due_date, status, received_at, received_amount, notes) VALUES ('${recId}', '${CID}', ${sqlEsc(e.description)}, ${sqlEsc(e.clientName)}, ${e.amount}, ${sqlEsc(dateStr)}, 'received', ${sqlEsc(dateStr)}, ${e.amount}, ${sqlEsc(e.notes)});`)
  settlementStmts.push(`INSERT INTO settlements (id, company_id, receivable_id, type, amount, settled_at, payment_method, created_by) VALUES ('${setId}', '${CID}', '${recId}', 'receipt', ${e.amount}, ${sqlEsc(dateStr)}, 'pix', '${UID}');`)
  transactionStmts.push(`INSERT INTO transactions (id, company_id, type, amount, date, description, receivable_id, settlement_id) VALUES ('${transId}', '${CID}', 'income', ${e.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(e.description)}, '${recId}', '${setId}');`)
})

// 3. Saídas (114 paid expense)
normalized.saidas.forEach((s, idx) => {
  const payId = toUUID(`pay:saida:${idx}`)
  const transId = toUUID(`trans:saida:${idx}`)
  const setId = toUUID(`set:saida:${idx}`)
  const dateStr = s.date
  const suppId = supplierMap.get(s.beneficiaryName) || null
  const pm = mapPaymentMethod(s.paymentMethod)

  payableStmts.push(`INSERT INTO payables (id, company_id, description, supplier_id, amount, due_date, status, paid_at, paid_amount, notes) VALUES ('${payId}', '${CID}', ${sqlEsc(s.description)}, ${suppId ? sqlEsc(suppId) : 'NULL'}, ${s.amount}, ${sqlEsc(dateStr)}, 'paid', ${sqlEsc(dateStr)}, ${s.amount}, ${sqlEsc(s.proof)});`)
  settlementStmts.push(`INSERT INTO settlements (id, company_id, payable_id, type, amount, settled_at, payment_method, proof_url, created_by) VALUES ('${setId}', '${CID}', '${payId}', 'payment', ${s.amount}, ${sqlEsc(dateStr)}, '${pm}', ${sqlEsc(s.proof)}, '${UID}');`)
  transactionStmts.push(`INSERT INTO transactions (id, company_id, type, amount, date, description, payable_id, settlement_id) VALUES ('${transId}', '${CID}', 'expense', ${s.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(s.description)}, '${payId}', '${setId}');`)
})

// 4. Pending Receivables & Payables
normalized.receivables.filter(r => r.status === 'open').forEach((r, idx) => {
  const recId = toUUID(`rec:open:${idx}`)

  receivableStmts.push(`INSERT INTO receivables (id, company_id, description, client_name, amount, due_date, status, notes) VALUES ('${recId}', '${CID}', ${sqlEsc(r.description)}, ${sqlEsc(r.clientName)}, ${r.amount}, ${sqlEsc(r.dueDate)}, 'open', ${sqlEsc(r.notes)});`)
})

normalized.payables.filter(p => p.status === 'open').forEach((p, idx) => {
  const payId = toUUID(`pay:open:${idx}`)
  const suppId = supplierMap.get(p.supplierName) || null

  payableStmts.push(`INSERT INTO payables (id, company_id, description, supplier_id, amount, due_date, status, notes) VALUES ('${payId}', '${CID}', ${sqlEsc(p.description)}, ${suppId ? sqlEsc(suppId) : 'NULL'}, ${p.amount}, ${sqlEsc(p.dueDate)}, 'open', ${sqlEsc(p.notes)});`)
})

// 5. Comissões & Vendas
const comissRaw = sheetData.Comissoes || []
const comissRows = comissRaw.slice(3).filter(r => r && r[0] && r[5] !== undefined && typeof r[5] === 'number')

comissRows.forEach((c, idx) => {
  const buyerName = String(c[1] || '').trim()
  const grossComm = Number(c[5] || 0)
  const netComm = Number(c[7] || grossComm)
  const re9Comm = Number(c[9] || netComm)
  const isReceived = String(c[11] || '').trim().toLowerCase() === 'sim'

  const saleId = toUUID(`sale:${idx}`)
  const commId = toUUID(`comm:${idx}`)

  saleStmts.push(`INSERT INTO sales (id, company_id, buyer_name, sale_value, sale_date, status) VALUES ('${saleId}', '${CID}', ${sqlEsc(buyerName)}, ${Number(c[3] || 0)}, '2026-05-01', ${isReceived ? '\'settled\'' : '\'active\''});`)
  commissionStmts.push(`INSERT INTO commissions (id, company_id, sale_id, total_amount, status) VALUES ('${commId}', '${CID}', '${saleId}', ${re9Comm}, ${isReceived ? '\'received\'' : '\'pending\''});`)
})

const orderedStatements = [
  ...cleanupStmts,
  ...supplierStmts,
  ...receivableStmts,
  ...payableStmts,
  ...settlementStmts,
  ...transactionStmts,
  ...saleStmts,
  ...commissionStmts,
]

fs.writeFileSync('docs/migracao/statements.json', JSON.stringify(orderedStatements, null, 2))

// Chunk into 3 ordered files
const chunks = []
const chunkSize = 160
for (let i = 0; i < orderedStatements.length; i += chunkSize)
  chunks.push(orderedStatements.slice(i, i + chunkSize))

chunks.forEach((chunk, idx) => {
  const sql = ['BEGIN;', 'ALTER TABLE payables DISABLE TRIGGER USER;', 'ALTER TABLE receivables DISABLE TRIGGER USER;', ...chunk, 'ALTER TABLE payables ENABLE TRIGGER USER;', 'ALTER TABLE receivables ENABLE TRIGGER USER;', 'COMMIT;'].join('\n')

  fs.writeFileSync(`docs/migracao/ordered_chunk_${idx}.sql`, sql)
})

console.log(`Generated ${orderedStatements.length} ordered SQL statements across ${chunks.length} chunks.`)
