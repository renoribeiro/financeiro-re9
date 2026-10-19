import fs from 'node:fs'

const statements = JSON.parse(fs.readFileSync('docs/migracao/statements.json', 'utf8'))

const settlements = statements.filter(s => s.startsWith('INSERT INTO settlements'))
const transactions = statements.filter(s => s.startsWith('INSERT INTO transactions'))
const sales = statements.filter(s => s.startsWith('INSERT INTO sales'))
const commissions = statements.filter(s => s.startsWith('INSERT INTO commissions'))

const set1 = settlements.slice(0, 70)
const set2 = settlements.slice(70)

const tr1 = transactions.slice(0, 70)
const tr2 = transactions.slice(70)

fs.writeFileSync('docs/migracao/b2_part1.sql', ['BEGIN;', ...set1, 'COMMIT;'].join('\n'))
fs.writeFileSync('docs/migracao/b2_part2.sql', ['BEGIN;', ...set2, 'COMMIT;'].join('\n'))

fs.writeFileSync('docs/migracao/b3_part1.sql', ['BEGIN;', ...tr1, 'COMMIT;'].join('\n'))
fs.writeFileSync('docs/migracao/b3_part2.sql', ['BEGIN;', ...tr2, 'COMMIT;'].join('\n'))

fs.writeFileSync('docs/migracao/b4.sql', ['BEGIN;', ...sales, ...commissions, 'COMMIT;'].join('\n'))

console.log('Sub-batches created cleanly.')
