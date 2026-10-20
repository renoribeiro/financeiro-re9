import { resolveAuthUserId } from '../utils/authUser'

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

assert('claims do JWT: usa o sub', resolveAuthUserId({ sub: 'user-1', role: 'authenticated' }) === 'user-1')
assert('objeto de usuário completo: usa o id', resolveAuthUserId({ id: 'user-2', email: 'a@b.c' }) === 'user-2')
assert('id tem prioridade sobre sub', resolveAuthUserId({ id: 'user-3', sub: 'outro' }) === 'user-3')
assert('id vazio cai para o sub', resolveAuthUserId({ id: '  ', sub: 'user-4' }) === 'user-4')
assert('remove espaços', resolveAuthUserId({ sub: '  user-5  ' }) === 'user-5')
assert('sem identificador retorna null', resolveAuthUserId({ role: 'authenticated' }) === null)
assert('valor nulo retorna null', resolveAuthUserId(null) === null)

console.log(`\nAuthUser: ${passed} passaram, ${failed} falharam.`)
if (failed > 0)
  process.exit(1)
