// ============================================================================
// GET /api/nfse/status
// Informa se a emissão real de NFS-e está configurada (certificado + ambiente),
// SEM expor segredos. Usado pela UI para alternar entre emissão real e o modo
// simulado (mock), e para exibir alertas de validade do certificado.
// ============================================================================
import { getNfseConfig } from '../../utils/nfse/config'
import { isCertificateConfigured, loadCertificate } from '../../utils/nfse/certificate'

export default defineEventHandler(() => {
  const cfg = getNfseConfig()
  const hasCert = isCertificateConfigured()

  let certificate: {
    present: boolean
    subjectCN?: string
    holderDocument?: string
    notAfter?: string
    daysToExpire?: number
    error?: string
  } = { present: false }

  if (hasCert) {
    try {
      const c = loadCertificate()
      const daysToExpire = Math.floor((new Date(c.notAfter).getTime() - Date.now()) / 86400000)

      certificate = {
        present: true,
        subjectCN: c.subjectCN,
        holderDocument: c.holderDocument,
        notAfter: c.notAfter,
        daysToExpire,
      }
    }
    catch (err) {
      // Certificado presente porém inválido (senha errada, arquivo corrompido).
      certificate = { present: true, error: (err as Error).message }
    }
  }

  const configured = hasCert && certificate.present && !certificate.error

  return {
    configured,
    provider: cfg.provider,
    ambiente: cfg.ambiente,
    municipioIbge: cfg.municipioIbge,
    certificate,
  }
})
