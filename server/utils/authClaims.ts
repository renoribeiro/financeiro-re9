export interface AuthenticatedClaims extends Record<string, unknown> {
  id: string
  sub: string
}

/**
 * `serverSupabaseUser()` retorna os claims do JWT. Nas versões atuais do módulo,
 * o identificador do usuário fica em `sub`, não em `id`.
 */
export function normalizeAuthenticatedClaims(value: unknown): AuthenticatedClaims | null {
  if (!value || typeof value !== 'object')
    return null

  const claims = value as Record<string, unknown>
  const subject = typeof claims.sub === 'string' ? claims.sub.trim() : ''

  if (!subject)
    return null

  return { ...claims, sub: subject, id: subject }
}
