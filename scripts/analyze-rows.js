import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

const sheetsToAnalyze = ['Entradas', 'Saidas', 'Contas a Pagar', 'Contas a Receber', 'Comissoes', 'Custos Fixos']

sheetsToAnalyze.forEach(sheetName => {
  console.log(`\n=================== ${sheetName} ===================`)

  const rows = data[sheetName]

  rows.forEach((r, idx) => {
    if (r && r.some(cell => cell !== '' && cell !== undefined))
      console.log(`Row ${idx + 1}:`, JSON.stringify(r.filter(c => c !== undefined)))
  })
})
