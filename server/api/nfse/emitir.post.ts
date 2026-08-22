import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured } from '../../utils/nfse/certificate'
import type { EmitirNfsePayload, EmitirNfseResult } from '../../utils/nfse/types'
import { emitirNfse } from '../../utils/nfse/ginfes/client'
import { emitirRequestSchema, parseBody } from '../../utils/nfse/schemas'
import { enforceRateLimit, requireAuthenticatedUser, requireCompanyRole } from '../../utils/security'

export default defineEventHandler(async (event): Promise<EmitirNfseResult> => {
  await requireAuthenticatedUser(event)

  const body = await parseBody(event, emitirRequestSchema)
  const { user, client, company } = await requireCompanyRole(event, body.companyId, ['super_admin', 'admin', 'financial'])
  const db = client as any

  enforceRateLimit(event, user.id, 5)

  const cfg = getNfseConfig()
  if (!cfg.enabled)
    throw createError({ statusCode: 503, message: 'Emissão fiscal desabilitada por segurança.' })
  if (!isCertificateConfigured())
    throw createError({ statusCode: 503, message: 'Certificado fiscal não configurado.' })
  if (cfg.provider === 'nacional')
    throw createError({ statusCode: 503, message: 'NFS-e Nacional ainda não habilitada.' })
  if (!company.cnpj || !company.municipal_registration)
    throw createError({ statusCode: 422, message: 'CNPJ ou inscrição municipal da empresa não configurados.' })

  const { data: persistedInvoice, error: invoiceError } = await db
    .from('invoices')
    .select('*')
    .eq('id', body.invoiceId)
    .eq('company_id', body.companyId)
    .single()

  if (invoiceError || !persistedInvoice)
    throw createError({ statusCode: 404, message: 'Nota fiscal persistida não encontrada.' })
  if (persistedInvoice.status === 'issued')
    throw createError({ statusCode: 409, message: 'A nota já foi emitida.' })
  if (persistedInvoice.status === 'cancelled')
    throw createError({ statusCode: 409, message: 'Uma nota cancelada não pode ser reemitida pelo mesmo registro.' })
  if (persistedInvoice.status === 'processing' || persistedInvoice.rps_number)
    throw createError({ statusCode: 409, message: 'Já existe um RPS reservado. Consulte o processamento antes de tentar novamente.' })

  if (!persistedInvoice.service_code || !persistedInvoice.service_description
    || !persistedInvoice.amount || !persistedInvoice.taker_name || !persistedInvoice.taker_document)
    throw createError({ statusCode: 422, message: 'A nota persistida não possui todos os dados fiscais obrigatórios.' })

  const rpsSeries = persistedInvoice.rps_series || '1'

  const { data: rpsNumber, error: rpsError } = await db.rpc('next_rps_number', {
    target_company: body.companyId,
    target_environment: cfg.ambiente,
    target_series: rpsSeries,
  })

  if (rpsError)
    throw createError({ statusCode: 409, message: `Não foi possível reservar o RPS: ${rpsError.message}` })

  const invoice = persistedInvoice
  const takerAddress = (invoice.taker_address ?? {}) as Record<string, string | undefined>
  let normalizedTakerAddress
  if (Object.keys(takerAddress).length) {
    normalizedTakerAddress = {
      logradouro: takerAddress.street,
      numero: takerAddress.number,
      complemento: takerAddress.complement,
      bairro: takerAddress.neighborhood,
      cidadeIbge: takerAddress.cityIbge,
      uf: takerAddress.state,
      cep: takerAddress.zipCode,
    }
  }

  const municipio = invoice.municipio_ibge || company.city_ibge || cfg.municipioIbge

  const payload: EmitirNfsePayload = {
    prestador: {
      cnpj: company.cnpj,
      inscricaoMunicipal: company.municipal_registration,
      razaoSocial: company.name,
      nomeFantasia: company.trade_name ?? undefined,
      cnaeCode: invoice.cnae_code || company.main_cnae || undefined,
      optanteSimplesNacional: company.tax_regime === 'simples_nacional',
      cityIbge: company.city_ibge || cfg.municipioIbge,
    },
    tomador: {
      razaoSocial: invoice.taker_name,
      documento: invoice.taker_document,
      email: invoice.taker_email ?? undefined,
      endereco: normalizedTakerAddress,
    },
    servico: {
      itemListaServico: invoice.service_code,
      codigoTributacaoMunicipio: invoice.ctiss,
      cnaeCode: invoice.cnae_code || company.main_cnae || undefined,
      discriminacao: invoice.service_description,
      valorServicos: invoice.amount,
      valorDeducoes: invoice.deductions_amount,
      aliquota: invoice.iss_rate,
      issRetido: invoice.iss_retido,
      codigoMunicipio: municipio,
      exigibilidadeIss: 1,
    },
    rps: {
      numero: String(rpsNumber),
      serie: rpsSeries,
      tipo: invoice.rps_type || 1,
      dataEmissao: body.invoice.dataEmissao || new Date().toISOString(),
      competencia: invoice.competencia,
      naturezaOperacao: 1,
    },
  }

  try {
    const { error: processingError } = await db.from('invoices').update({
      status: 'processing',
      rps_number: rpsNumber,
      rps_series: rpsSeries,
      environment: cfg.ambiente,
      updated_at: new Date().toISOString(),
    }).eq('id', body.invoiceId)

    if (processingError)
      throw new Error(`Não foi possível registrar o início da emissão: ${processingError.message}`)

    const result = await emitirNfse(payload, cfg)

    const { error: resultPersistenceError } = await db.from('invoices').update({
      status: result.success ? 'issued' : 'error',
      nfse_number: result.invoiceNumber,
      verification_code: result.verificationCode,
      protocol: result.protocol,
      issued_at: result.issuedAt,
      xml_response: result.xmlBase64,
      public_url: result.publicUrl,
      error_message: result.errors?.map(error => error.message).join(' · ') || null,
      updated_at: new Date().toISOString(),
    }).eq('id', body.invoiceId)

    // Se a prefeitura respondeu com sucesso, nunca reenvie automaticamente só
    // porque a atualização local falhou. O RPS permanece consultável.
    if (resultPersistenceError)
      console.error('[nfse/emitir] resposta fiscal obtida, mas persistência falhou:', resultPersistenceError.message)

    return { ...result, rpsNumber: String(rpsNumber) }
  }
  catch (error) {
    const { error: failurePersistenceError } = await db.from('invoices').update({
      status: 'error',
      rps_number: rpsNumber,
      error_message: (error as Error).message,
      updated_at: new Date().toISOString(),
    }).eq('id', body.invoiceId)

    if (failurePersistenceError)
      console.error('[nfse/emitir] falha ao persistir erro fiscal:', failurePersistenceError.message)
    setResponseStatus(event, 502)

    return {
      success: false,
      status: 'error',
      rpsNumber: String(rpsNumber),
      errors: [{ code: 'FALHA_EMISSAO', message: (error as Error).message }],
      environment: cfg.ambiente,
    }
  }
})
