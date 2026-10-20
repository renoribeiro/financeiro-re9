// ============================================================================
// Identificador do usuário logado. Nas versões atuais do @nuxtjs/supabase,
// `useSupabaseUser()` devolve os claims do JWT, em que o id fica em `sub`;
// objetos de usuário completos (versões antigas) trazem `id`.
// ============================================================================

export function resolveAuthUserId(user: unknown): string | null {
  if (!user || typeof user !== 'object')
    return null

  const record = user as Record<string, unknown>
  for (const key of ['id', 'sub']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim())
      return value.trim()
  }

  return null
}
