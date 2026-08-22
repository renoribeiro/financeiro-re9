import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured } from '../../utils/nfse/certificate'
import type { CancelarNfsePayload, CancelarNfseResult } from '../../utils/nfse/types'
import { cancelarNfse } from '../../utils/nfse/ginfes/client'
import { cancelarRequestSchema, parseBody } from '../../utils/nfse/schemas'
import { enforceRateLimit, requireAuthenticatedUser, requireCompanyRole } from '../../utils/security'

export default defineEventHandler(async (event): Promise<CancelarNfseResult> => {
  await requireAuthenticatedUser(event)

  const body = await parseBody(event, cancelarRequestSchema)
  const { user, client, company } = await requireCompanyRole(event, body.companyId, ['super_admin', 'admin', 'financial'])
  const db = client as any

  enforceRateLimit(event, user.id, 3)

  const cfg = getNfseConfig()
  if (!cfg.enabled || !isCertificateConfigured())
    throw createError({ statusCode: 503, message: 'Cancelamento fiscal não configurado.' })
  if (cfg.provider === 'nacional')
    throw createError({ statusCode: 503, message: 'Cancelamento pela NFS-e Nacional ainda não habilitado.' })
  if (!company.cnpj)
    throw createError({ statusCode: 422, message: 'CNPJ da empresa não configurado.' })

  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .select('id, status, nfse_number, municipio_ibge')
    .eq('id', body.invoiceId)
    .eq('company_id', body.companyId)
    .single()

  if (invoiceError || !invoice)
    throw createError({ statusCode: 404, message: 'Nota fiscal persistida não encontrada.' })
  if (invoice.status !== 'issued' || !invoice.nfse_number)
    throw createError({ statusCode: 409, message: 'Somente uma NFS-e emitida pode ser cancelada.' })

  const payload: CancelarNfsePayload = {
    prestador: {
      cnpj: company.cnpj,
      inscricaoMunicipal: company.municipal_registration ?? undefined,
      cityIbge: company.city_ibge || cfg.municipioIbge,
    },
    numeroNfse: invoice.nfse_number,
    codigoMunicipio: invoice.municipio_ibge || company.city_ibge || cfg.municipioIbge,
    codigoCancelamento: body.codigoCancelamento,
    motivo: body.motivo,
  }

  try {
    const result = await cancelarNfse(payload, cfg)
    if (result.success) {
      const { error: persistenceError } = await db.from('invoices').update({
        status: 'cancelled',
        cancelled_at: result.cancelledAt ?? new Date().toISOString(),
        cancel_reason: body.motivo,
        error_message: null,
        updated_at: new Date().toISOString(),
      }).eq('id', body.invoiceId).eq('company_id', body.companyId)

      if (persistenceError)
        throw new Error(`A prefeitura cancelou a nota, mas a atualização local falhou: ${persistenceError.message}`)
    }

    return result
  }
  catch (error) {
    await db.from('invoices').update({
      error_message: (error as Error).message,
      updated_at: new Date().toISOString(),
    }).eq('id', invoice.id).eq('company_id', body.companyId)
    setResponseStatus(event, 502)

    return { success: false, errors: [{ code: 'FALHA_CANCELAMENTO', message: (error as Error).message }] }
  }
})
