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

// Map categories
const categories = [
  { name: 'Comissão', type: 'revenue', code: '1.1' },
  { name: 'Investimento / Aporte', type: 'revenue', code: '1.2' },
  { name: 'Outras Receitas', type: 'revenue', code: '1.3' },
  { name: 'Marketing / Tráfego', type: 'expense', code: '2.1' },
  { name: 'Repasse de Comissão', type: 'expense', code: '2.2' },
  { name: 'Pessoal / Salários', type: 'expense', code: '2.3' },
  { name: 'Impostos (DAS / Simples)', type: 'expense', code: '2.4' },
  { name: 'Infraestrutura / Web', type: 'expense', code: '2.5' },
  { name: 'Software / Assinaturas', type: 'expense', code: '2.6' },
  { name: 'Equipamentos', type: 'expense', code: '2.7' },
  { name: 'Contabilidade', type: 'expense', code: '2.8' },
  { name: 'Outras Despesas', type: 'expense', code: '2.9' },
]

// Generate SQL
const sqlLines = []

sqlLines.push(`-- SYNC DATASET FROM GOOGLE SHEETS PLANILHA V2 (${new Date().toISOString()})`)
sqlLines.push('BEGIN;')

// Clear old transactions, settlements, payables, receivables for RE9 Imóveis
sqlLines.push(`DELETE FROM settlements WHERE company_id = '${CID}';`)
sqlLines.push(`DELETE FROM transactions WHERE company_id = '${CID}';`)
sqlLines.push(`DELETE FROM payables WHERE company_id = '${CID}';`)
sqlLines.push(`DELETE FROM receivables WHERE company_id = '${CID}';`)
sqlLines.push(`DELETE FROM commissions WHERE company_id = '${CID}';`)
sqlLines.push(`DELETE FROM sales WHERE company_id = '${CID}';`)

// Insert Chart Accounts if missing
categories.forEach(cat => {
  sqlLines.push(`
    INSERT INTO chart_accounts (id, company_id, code, name, type, is_active)
    VALUES (gen_random_uuid(), '${CID}', ${sqlEsc(cat.code)}, ${sqlEsc(cat.name)}, ${sqlEsc(cat.type)}, TRUE)
    ON CONFLICT (company_id, code) DO UPDATE SET name = EXCLUDED.name;
  `)
})

// 1. Process Entradas (19 entries) -> Insert as Receivables (status='received') + Transactions (type='income') + Settlements
normalized.entradas.forEach(e => {
  const recId = genUUID()
  const transId = genUUID()
  const setId = genUUID()
  const dateStr = e.date

  sqlLines.push(`
    INSERT INTO receivables (id, company_id, description, client_name, amount, due_date, status, received_at, received_amount, notes)
    VALUES ('${recId}', '${CID}', ${sqlEsc(e.description)}, ${sqlEsc(e.clientName)}, ${e.amount}, ${sqlEsc(dateStr)}, 'received', ${sqlEsc(dateStr)}, ${e.amount}, ${sqlEsc(e.notes)});

    INSERT INTO settlements (id, company_id, receivable_id, amount, settled_at)
    VALUES ('${setId}', '${CID}', '${recId}', ${e.amount}, ${sqlEsc(dateStr)});

    INSERT INTO transactions (id, company_id, type, amount, date, description, receivable_id, payment_method)
    VALUES ('${transId}', '${CID}', 'income', ${e.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(e.description)}, '${recId}', 'Pix');
  `)
})

// 2. Process Saídas (114 entries) -> Insert as Payables (status='paid') + Transactions (type='expense') + Settlements
normalized.saidas.forEach(s => {
  const payId = genUUID()
  const transId = genUUID()
  const setId = genUUID()
  const dateStr = s.date

  sqlLines.push(`
    INSERT INTO payables (id, company_id, description, supplier_name, amount, due_date, status, paid_at, paid_amount, notes)
    VALUES ('${payId}', '${CID}', ${sqlEsc(s.description)}, ${sqlEsc(s.beneficiaryName)}, ${s.amount}, ${sqlEsc(dateStr)}, 'paid', ${sqlEsc(dateStr)}, ${s.amount}, ${sqlEsc(s.proof)});

    INSERT INTO settlements (id, company_id, payable_id, amount, settled_at, proof_url)
    VALUES ('${setId}', '${CID}', '${payId}', ${s.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(s.proof)});

    INSERT INTO transactions (id, company_id, type, amount, date, description, payable_id, payment_method, proof_url)
    VALUES ('${transId}', '${CID}', 'expense', ${s.amount}, ${sqlEsc(dateStr)}, ${sqlEsc(s.description)}, '${payId}', ${sqlEsc(s.paymentMethod)}, ${sqlEsc(s.proof)});
  `)
})

// 3. Process Pending Contas a Receber (open receivables)
normalized.receivables.filter(r => r.status === 'open').forEach(r => {
  const recId = genUUID()

  sqlLines.push(`
    INSERT INTO receivables (id, company_id, description, client_name, amount, due_date, status, notes)
    VALUES ('${recId}', '${CID}', ${sqlEsc(r.description)}, ${sqlEsc(r.clientName)}, ${r.amount}, ${sqlEsc(r.dueDate)}, 'open', ${sqlEsc(r.notes)});
  `)
})

// 4. Process Pending Contas a Pagar (open payables)
normalized.payables.filter(p => p.status === 'open').forEach(p => {
  const payId = genUUID()

  sqlLines.push(`
    INSERT INTO payables (id, company_id, description, supplier_name, amount, due_date, status, notes)
    VALUES ('${payId}', '${CID}', ${sqlEsc(p.description)}, ${sqlEsc(p.supplierName)}, ${p.amount}, ${sqlEsc(p.dueDate)}, 'open', ${sqlEsc(p.notes)});
  `)
})

sqlLines.push('COMMIT;')

const fullSql = sqlLines.join('\n')

fs.writeFileSync('docs/migracao/sync_data.sql', fullSql)
console.log(`Generated SQL file docs/migracao/sync_data.sql (${sqlLines.length} statements).`)
