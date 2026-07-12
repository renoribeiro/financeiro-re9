// ============================================================================
// Regras de validação PT-BR — auto-importadas pelo Nuxt (utils/).
// Usadas nos diálogos de cadastro (VTextField/VSelect :rules).
// ============================================================================

export type ValidationRule = (v: unknown) => true | string

/** Campo obrigatório (rejeita null/undefined/''/array vazio). */
export const requiredRule: ValidationRule = v => {
  if (Array.isArray(v))
    return v.length > 0 || 'Campo obrigatório'

  return (v !== null && v !== undefined && String(v).trim() !== '') || 'Campo obrigatório'
}

/** Número estritamente positivo. */
export const positiveRule: ValidationRule = v => {
  const n = Number(v)

  return (!Number.isNaN(n) && n > 0) || 'Informe um valor maior que zero'
}

/** Percentual entre 0 e 100. */
export const percentRule: ValidationRule = v => {
  const n = Number(v)

  return (!Number.isNaN(n) && n >= 0 && n <= 100) || 'Informe um percentual entre 0 e 100'
}

// ---- Documentos (dígitos verificadores) ------------------------------------

/** Valida CPF pelos dígitos verificadores. */
export function isValidCPF(value: string): boolean {
  const cpf = (value || '').replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf))
    return false

  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++)
      sum += Number(cpf[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11

    return rest === 10 ? 0 : rest
  }

  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

/** Valida CNPJ pelos dígitos verificadores. */
export function isValidCNPJ(value: string): boolean {
  const cnpj = (value || '').replace(/\D/g, '')
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj))
    return false

  const calc = (len: number) => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

    let sum = 0
    for (let i = 0; i < len; i++)
      sum += Number(cnpj[i]) * weights[i]
    const rest = sum % 11

    return rest < 2 ? 0 : 11 - rest
  }

  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

/** Valida CPF ou CNPJ conforme a quantidade de dígitos. */
export const documentRule: ValidationRule = v => {
  const digits = String(v ?? '').replace(/\D/g, '')
  if (!digits)
    return 'Campo obrigatório'
  if (digits.length === 11)
    return isValidCPF(digits) || 'CPF inválido'
  if (digits.length === 14)
    return isValidCNPJ(digits) || 'CNPJ inválido'

  return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)'
}

/** Valida especificamente CPF. */
export const cpfRule: ValidationRule = v =>
  isValidCPF(String(v ?? '')) || 'CPF inválido'
