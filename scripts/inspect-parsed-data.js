import fs from 'node:fs'

const data = JSON.parse(fs.readFileSync('docs/migracao/parsed_sheets.json', 'utf8'))

for (const key of Object.keys(data)) {
  const rows = data[key]

  console.log(`\n=== SHEET: ${key} (${rows.length} rows) ===`)

  const nonNullRows = rows.filter(r => r && r.length > 0)

  console.log(`Non-empty rows: ${nonNullRows.length}`)
  if (nonNullRows.length > 0) {
    console.log('Header/First row:', JSON.stringify(nonNullRows[0]))
    if (nonNullRows.length > 1)
      console.log('Sample row 2:', JSON.stringify(nonNullRows[1]))
  }
}
