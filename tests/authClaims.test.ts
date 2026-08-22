import { normalizeAuthenticatedClaims } from '../server/utils/authClaims'

let passed = 0
let failed = 0

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++
  }
  else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

const claims = normalizeAuthenticatedClaims({ sub: '  user-123  ', role: 'authenticated' })

assert('normaliza o subject do JWT como id', claims?.id === 'user-123')
assert('preserva o subject normalizado', claims?.sub === 'user-123')
assert('preserva os demais claims', claims?.role === 'authenticated')
assert('rejeita claims ausentes', normalizeAuthenticatedClaims(null) === null)
assert('rejeita subject ausente', normalizeAuthenticatedClaims({ role: 'authenticated' }) === null)
assert('rejeita subject vazio', normalizeAuthenticatedClaims({ sub: '   ' }) === null)

console.log(`\nAuthClaims: ${passed} passaram, ${failed} falharam.`)
if (failed > 0)
  process.exit(1)
