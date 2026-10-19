import fs from 'node:fs'

const chunks = JSON.parse(fs.readFileSync('docs/migracao/chunks.json', 'utf8'))
const CID = 'e11042be-3d22-4048-9380-ac71e8dc9252'

console.log(`Executing ${chunks.length} chunks...`)

for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i]

  const sql = [
    'BEGIN;',
    'ALTER TABLE payables DISABLE TRIGGER USER;',
    'ALTER TABLE receivables DISABLE TRIGGER USER;',
    ...chunk,
    'ALTER TABLE payables ENABLE TRIGGER USER;',
    'ALTER TABLE receivables ENABLE TRIGGER USER;',
    'COMMIT;',
  ].join('\n')

  fs.writeFileSync(`docs/migracao/run_chunk_${i}.sql`, sql)
}

console.log('Prepared run_chunk_0.sql .. run_chunk_11.sql!')
