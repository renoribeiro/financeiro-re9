// ============================================================================
// Testes de lógica pura (item D1). Rodáveis sem framework via `tsx`:
//   npx tsx tests/validators.test.ts
// Ao adicionar Vitest (pnpm add -D vitest), estes viram `describe/it` com
// `expect` — a lógica testada permanece a mesma.
// ============================================================================

import { cpfRule, documentRule, isValidCNPJ, isValidCPF } from '../utils/validators'

let passed = 0
let failed = 0

function assert(name: string, cond: boolean) {
  if (cond) {
    passed++
  }
  else {
    failed++
    console.error(`  ✗ ${name}`)
  }
}

// ---- CPF --------------------------------------------------------------------
assert('CPF válido (529.982.247-25)', isValidCPF('52998224725'))
assert('CPF válido com máscara', isValidCPF('529.982.247-25'))
assert('CPF inválido (dígito errado)', !isValidCPF('52998224726'))
assert('CPF rejeita repetidos', !isValidCPF('11111111111'))
assert('CPF rejeita tamanho errado', !isValidCPF('123'))

// ---- CNPJ -------------------------------------------------------------------
assert('CNPJ válido (11.222.333/0001-81)', isValidCNPJ('11222333000181'))
assert('CNPJ válido com máscara', isValidCNPJ('11.222.333/0001-81'))
assert('CNPJ inválido (dígito errado)', !isValidCNPJ('11222333000182'))
assert('CNPJ rejeita repetidos', !isValidCNPJ('00000000000000'))

// ---- Regras -----------------------------------------------------------------
assert('documentRule aceita CPF válido', documentRule('52998224725') === true)
assert('documentRule aceita CNPJ válido', documentRule('11222333000181') === true)
assert('documentRule rejeita inválido', typeof documentRule('12345678900') === 'string')
assert('documentRule rejeita vazio', typeof documentRule('') === 'string')
assert('cpfRule rejeita CNPJ', typeof cpfRule('11222333000181') === 'string')

console.log(`\nValidators: ${passed} passaram, ${failed} falharam.`)
if (failed > 0)
  process.exit(1)
