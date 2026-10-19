import fs from 'node:fs'

const statements = JSON.parse(fs.readFileSync('docs/migracao/statements.json', 'utf8'))

const cleanupAndSuppliers = statements.filter(s => s.startsWith('DELETE') || s.startsWith('INSERT INTO suppliers'))
const receivables = statements.filter(s => s.startsWith('INSERT INTO receivables'))
const payables = statements.filter(s => s.startsWith('INSERT INTO payables'))
const settlements = statements.filter(s => s.startsWith('INSERT INTO settlements'))
const transactions = statements.filter(s => s.startsWith('INSERT INTO transactions'))
const sales = statements.filter(s => s.startsWith('INSERT INTO sales'))
const commissions = statements.filter(s => s.startsWith('INSERT INTO commissions'))

console.log(`Suppliers: ${cleanupAndSuppliers.length}`)
console.log(`Receivables: ${receivables.length}`)
console.log(`Payables: ${payables.length}`)
console.log(`Settlements: ${settlements.length}`)
console.log(`Transactions: ${transactions.length}`)
console.log(`Sales: ${sales.length}`)
console.log(`Commissions: ${commissions.length}`)

const b1 = ['BEGIN;', 'ALTER TABLE payables DISABLE TRIGGER USER;', 'ALTER TABLE receivables DISABLE TRIGGER USER;', ...receivables, ...payables, 'ALTER TABLE payables ENABLE TRIGGER USER;', 'ALTER TABLE receivables ENABLE TRIGGER USER;', 'COMMIT;'].join('\n')

const b2 = ['BEGIN;', ...settlements, 'COMMIT;'].join('\n')
const b3 = ['BEGIN;', ...transactions, 'COMMIT;'].join('\n')
const b4 = ['BEGIN;', ...sales, ...commissions, 'COMMIT;'].join('\n')

fs.writeFileSync('docs/migracao/batch_1.sql', b1)
fs.writeFileSync('docs/migracao/batch_2.sql', b2)
fs.writeFileSync('docs/migracao/batch_3.sql', b3)
fs.writeFileSync('docs/migracao/batch_4.sql', b4)

console.log('Batches generated successfully!')
