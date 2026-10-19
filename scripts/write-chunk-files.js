import fs from 'node:fs'

const chunks = JSON.parse(fs.readFileSync('docs/migracao/chunks.json', 'utf8'))

chunks.forEach((chunk, i) => {
  const sql = ['BEGIN;', ...chunk, 'COMMIT;'].join('\n')

  fs.writeFileSync(`docs/migracao/chunk_${i}.sql`, sql)
})
console.log(`Wrote ${chunks.length} chunk SQL files.`)
