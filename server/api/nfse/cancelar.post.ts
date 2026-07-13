// ============================================================================
// POST /api/nfse/cancelar
// Cancela uma NFS-e emitida na SEFIN Fortaleza (GINFES v03).
// ============================================================================
import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured } from '../../utils/nfse/certificate'
import type { CancelarNfsePayload, CancelarNfseResult } from '../../utils/nfse/types'
import { cancelarNfse } from '../../utils/nfse/ginfes/client'

interface CancelarRequest {
  company: { cnpj: string; municipalRegistration?: string; cityIbge?: string }
  numeroNfse: string
  codigoMunicipio?: string
  /** 1 = Erro na emissão, 2 = Serviço não prestado, 3 = Duplicidade, 4 = Outros. */
  codigoCancelamento?: string
  motivo?: string
}

export default defineEventHandler(async (event): Promise<CancelarNfseResult> => {
  const cfg = getNfseConfig()

  if (!isCertificateConfigured())
    return { success: false, errors: [{ code: 'NAO_CONFIGURADO', message: 'Cancelamento real não configurado: certificado A1 ausente.' }] }

  if (cfg.provider === 'nacional')
    return { success: false, errors: [{ code: 'PROVIDER_NACIONAL', message: 'Cancelamento via NFS-e Nacional ainda não habilitado. Use NFSE_PROVIDER=ginfes.' }] }

  const body = await readBody<CancelarRequest>(event)
  if (!body?.company?.cnpj || !body.numeroNfse)
    return { success: false, errors: [{ code: 'DADOS_INVALIDOS', message: 'Informe company.cnpj e numeroNfse.' }] }

  const payload: CancelarNfsePayload = {
    prestador: {
      cnpj: body.company.cnpj,
      inscricaoMunicipal: body.company.municipalRegistration,
      cityIbge: body.company.cityIbge || cfg.municipioIbge,
    },
    numeroNfse: body.numeroNfse,
    codigoMunicipio: body.codigoMunicipio || body.company.cityIbge || cfg.municipioIbge,
    codigoCancelamento: body.codigoCancelamento || '1',
    motivo: body.motivo,
  }

  try {
    return await cancelarNfse(payload, cfg)
  }
  catch (e) {
    return { success: false, errors: [{ code: 'FALHA_CANCELAMENTO', message: (e as Error).message }] }
  }
})
