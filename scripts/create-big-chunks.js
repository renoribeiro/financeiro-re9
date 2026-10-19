import fs from 'node:fs'

const statements = JSON.parse(fs.readFileSync('docs/migracao/statements.json', 'utf8'))

// Chunk 0 had 35 statements (indexes 0 to 34).
// Remaining statements are from index 35 to the end.
const remaining = statements.slice(35)

console.log(`Remaining statements to run: ${remaining.length}`)

const bigChunks = []
const size = 150

for (let i = 0; i < remaining.length; i += size)
  bigChunks.push(remaining.slice(i, i + size))

bigChunks.forEach((chunk, idx) => {
  const sql = [
    'BEGIN;',
    'ALTER TABLE payables DISABLE TRIGGER USER;',
    'ALTER TABLE receivables DISABLE TRIGGER USER;',
    ...chunk,
    'ALTER TABLE payables ENABLE TRIGGER USER;',
    'ALTER TABLE receivables ENABLE TRIGGER USER;',
    'COMMIT;',
  ].join('\n')

  fs.writeFileSync(`docs/migracao/big_chunk_${idx + 1}.sql`, sql)
})

console.log(`Created ${bigChunks.length} big chunk files.`)
