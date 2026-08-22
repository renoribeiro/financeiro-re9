import type { H3Event } from 'h3'
import { normalizeAuthenticatedClaims } from './authClaims'
import type { Database } from '@/types/database.types'
// eslint-disable-next-line import/extensions
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export type CompanyRole = 'super_admin' | 'admin' | 'financial' | 'broker' | 'accountant' | 'viewer'

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

export async function requireAuthenticatedUser(event: H3Event) {
  const user = normalizeAuthenticatedClaims(await serverSupabaseUser(event))

  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado', message: 'Faça login para continuar.' })

  return user
}

export async function requireCompanyRole(event: H3Event, companyId: string, allowedRoles: CompanyRole[]) {
  const user = await requireAuthenticatedUser(event)
  const client = await serverSupabaseClient<Database>(event)

  const { data: membership, error: membershipError } = await client
    .from('company_members')
    .select('company_id, role')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError)
    throw createError({ statusCode: 500, message: 'Não foi possível validar a autorização.' })
  if (!membership || !allowedRoles.includes(membership.role as CompanyRole))
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado', message: 'Seu perfil não permite esta operação.' })

  const { data: company, error: companyError } = await client
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (companyError || !company)
    throw createError({ statusCode: 404, message: 'Empresa não encontrada.' })

  return { user, client, company, role: membership.role as CompanyRole }
}

/**
 * Contenção por processo Nitro. Para múltiplas réplicas, a evolução prevista é
 * mover o contador para Redis sem alterar o contrato dos endpoints.
 */
export function enforceRateLimit(event: H3Event, subject: string, limit: number, windowMs = 60_000) {
  const now = Date.now()
  const route = event.path.split('?')[0]
  const key = `${route}:${subject}`
  const current = rateLimitBuckets.get(key)

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs })

    return
  }

  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))

    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({ statusCode: 429, statusMessage: 'Muitas requisições', message: 'Tente novamente em instantes.' })
  }

  current.count += 1
}
