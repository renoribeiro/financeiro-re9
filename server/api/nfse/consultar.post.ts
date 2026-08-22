import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured } from '../../utils/nfse/certificate'
import type { ConsultarNfsePayload, EmitirNfseResult } from '../../utils/nfse/types'
import { consultarPorRps } from '../../utils/nfse/ginfes/client'
import { consultarRequestSchema, parseBody } from '../../utils/nfse/schemas'
import { enforceRateLimit, requireAuthenticatedUser, requireCompanyRole } from '../../utils/security'

export default defineEventHandler(async (event): Promise<EmitirNfseResult> => {
  await requireAuthenticatedUser(event)

  const body = await parseBody(event, consultarRequestSchema)
  const { user, client, company } = await requireCompanyRole(event, body.companyId, ['super_admin', 'admin', 'financial'])
  const db = client as any

  enforceRateLimit(event, user.id, 15)

  const cfg = getNfseConfig()
  if (!cfg.enabled || !isCertificateConfigured())
    throw createError({ statusCode: 503, message: 'Consulta fiscal não configurada.' })
  if (cfg.provider === 'nacional')
    throw createError({ statusCode: 503, message: 'Consulta pela NFS-e Nacional ainda não habilitada.' })
  if (!company.cnpj)
    throw createError({ statusCode: 422, message: 'CNPJ da empresa não configurado.' })

  const { data: invoice, error: invoiceError } = await db
    .from('invoices')
    .select('id, status, rps_number, rps_series, rps_type')
    .eq('id', body.invoiceId)
    .eq('company_id', body.companyId)
    .single()

  if (invoiceError || !invoice)
    throw createError({ statusCode: 404, message: 'Nota fiscal persistida não encontrada.' })
  if (!invoice.rps_number)
    throw createError({ statusCode: 422, message: 'A nota ainda não possui um RPS reservado.' })

  const payload: ConsultarNfsePayload = {
    prestador: {
      cnpj: company.cnpj,
      inscricaoMunicipal: company.municipal_registration ?? undefined,
      cityIbge: company.city_ibge || cfg.municipioIbge,
    },
    rpsNumero: String(invoice.rps_number),
    rpsSerie: invoice.rps_series || '1',
    rpsTipo: invoice.rps_type || 1,
  }

  try {
    const result = await consultarPorRps(payload, cfg)

    const { error: persistenceError } = await db.from('invoices').update({
      status: result.success && result.status === 'issued' ? 'issued' : invoice.status,
      nfse_number: result.invoiceNumber,
      verification_code: result.verificationCode,
      protocol: result.protocol,
      issued_at: result.issuedAt,
      xml_response: result.xmlBase64,
      public_url: result.publicUrl,
      error_message: result.errors?.map(error => error.message).join(' · ') || null,
      updated_at: new Date().toISOString(),
    }).eq('id', invoice.id).eq('company_id', body.companyId)

    if (persistenceError)
      throw new Error(`A consulta foi concluída, mas não pôde ser persistida: ${persistenceError.message}`)

    return result
  }
  catch (error) {
    await db.from('invoices').update({
      error_message: (error as Error).message,
      updated_at: new Date().toISOString(),
    }).eq('id', invoice.id).eq('company_id', body.companyId)
    setResponseStatus(event, 502)

    return {
      success: false,
      status: 'error',
      errors: [{ code: 'FALHA_CONSULTA', message: (error as Error).message }],
      environment: cfg.ambiente,
    }
  }
})
