import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

console.log('=== SAIDAS ROWS ===')

const saidas = data.Saidas || []

saidas.forEach((r, idx) => {
  if (r && r.some(c => c !== undefined && c !== ''))
    console.log(`Row ${idx + 1}:`, JSON.stringify(r))
})

console.log('\n=== CONTAS A PAGAR ROWS ===')

const pays = data['Contas a Pagar'] || []

pays.forEach((r, idx) => {
  if (r && r.some(c => c !== undefined && c !== ''))
    console.log(`Row ${idx + 1}:`, JSON.stringify(r))
})
