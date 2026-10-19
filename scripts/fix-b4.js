import fs from 'node:fs'

const statements = JSON.parse(fs.readFileSync('docs/migracao/statements.json', 'utf8'))

const rawSales = statements.filter(s => s.startsWith('INSERT INTO sales'))
const commissions = statements.filter(s => s.startsWith('INSERT INTO commissions'))

const sales = rawSales.map(s => {
  return s.replace('\'settled\'', '\'completed\'').replace('\'active\'', '\'in_progress\'')
})

fs.writeFileSync('docs/migracao/b4.sql', ['BEGIN;', ...sales, ...commissions, 'COMMIT;'].join('\n'))

console.log('b4.sql updated with valid sales status values.')
