// ============================================================================
// NFS-e SEFIN Fortaleza (referência) — item B1 do plano de melhorias.
// Monta o XML ABRASF, assina com o certificado A1 e envia via SOAP.
// Roda SOMENTE no servidor (o certificado nunca vai ao cliente). Ao ligar,
// mover para `server/utils/nfse/` e instalar `xml-crypto` + `node-forge`.
// ============================================================================

export interface NfseInput {
  company: {
    cnpj: string
    municipalRegistration?: string
    cnae: string
    issRate: number
  }
  taker: { name: string; document: string; email?: string }
  serviceDescription: string
  amount: number
  rpsNumber: string
  series: string
}

/** Monta o XML do RPS/NFS-e no padrão ABRASF (esqueleto). */
export function buildRpsXml(input: NfseInput): string {
  const iss = (input.amount * input.issRate / 100).toFixed(2)

  return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Rps>
    <InfDeclaracaoPrestacaoServico>
      <Rps><IdentificacaoRps><Numero>${input.rpsNumber}</Numero><Serie>${input.series}</Serie><Tipo>1</Tipo></IdentificacaoRps></Rps>
      <Servico>
        <Valores><ValorServicos>${input.amount.toFixed(2)}</ValorServicos><Aliquota>${input.issRate}</Aliquota><ValorIss>${iss}</ValorIss></Valores>
        <CodigoCnae>${input.company.cnae.replace(/\D/g, '')}</CodigoCnae>
        <Discriminacao>${escapeXml(input.serviceDescription)}</Discriminacao>
      </Servico>
      <Prestador><CpfCnpj><Cnpj>${input.company.cnpj.replace(/\D/g, '')}</Cnpj></CpfCnpj><InscricaoMunicipal>${input.company.municipalRegistration ?? ''}</InscricaoMunicipal></Prestador>
      <Tomador>
        <IdentificacaoTomador><CpfCnpj>${docTag(input.taker.document)}</CpfCnpj></IdentificacaoTomador>
        <RazaoSocial>${escapeXml(input.taker.name)}</RazaoSocial>
      </Tomador>
    </InfDeclaracaoPrestacaoServico>
  </Rps>
</GerarNfseEnvio>`
}

function docTag(doc: string): string {
  const d = doc.replace(/\D/g, '')

  return d.length === 11 ? `<Cpf>${d}</Cpf>` : `<Cnpj>${d}</Cnpj>`
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c] as string))
}

// Ao ligar:
// 1. signXml(xml, pfxBuffer, password)   -> assinatura XMLDSig com xml-crypto/node-forge
// 2. sendSoap(signedXml, SEFIN_ENDPOINT) -> POST SOAP, retry até 3x em timeout
// 3. parse do retorno -> { invoiceNumber, verificationCode } ou { errorMessage }
// 4. gerar DANFSE (PDF) e armazenar XML+PDF no Storage
