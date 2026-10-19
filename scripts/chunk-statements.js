import fs from 'node:fs'

const statements = JSON.parse(fs.readFileSync('docs/migracao/statements.json', 'utf8'))

console.log(`Total statements to run: ${statements.length}`)

// We group into chunks of 40 statements
const chunks = []
const chunkSize = 40

for (let i = 0; i < statements.length; i += chunkSize) {
  const chunk = statements.slice(i, i + chunkSize)

  chunks.push(chunk)
}

fs.writeFileSync('docs/migracao/chunks.json', JSON.stringify(chunks, null, 2))
console.log(`Created ${chunks.length} chunks.`)
