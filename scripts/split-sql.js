import fs from 'node:fs'

const statements = JSON.parse(fs.readFileSync('docs/migracao/statements.json', 'utf8'))

const part1 = ['BEGIN;', ...statements.slice(0, 250), 'COMMIT;'].join('\n')
const part2 = ['BEGIN;', ...statements.slice(250), 'COMMIT;'].join('\n')

fs.writeFileSync('docs/migracao/part1.sql', part1)
fs.writeFileSync('docs/migracao/part2.sql', part2)
console.log(`Part 1: ${part1.length} chars. Part 2: ${part2.length} chars.`)
