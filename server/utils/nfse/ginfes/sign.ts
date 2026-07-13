// ============================================================================
// Assinatura XMLDSig para o padrão GINFES v03 (Fortaleza).
//
// GINFES exige assinar DOIS elementos:
//   1. Cada RPS  → assina o elemento <InfRps Id="..."> ; a <Signature> vai como
//                  irmã, logo após <InfRps>, dentro de <Rps>.
//   2. O lote    → assina o elemento <LoteRps Id="..."> ; a <Signature> vai
//                  logo após </LoteRps>, dentro de <EnviarLoteRpsEnvio>.
//
// Parâmetros (confirmados na pesquisa):
//   • SignatureAlgorithm     = RSA-SHA1  (rsa-sha1)
//   • CanonicalizationMethod = C14N      (xml-c14n-20010315)
//   • Transforms             = enveloped-signature + C14N
//   • DigestMethod           = SHA1
// (SHA-256 é suportado via `algo: 'sha256'` para o caminho Nacional/DPS.)
// ============================================================================
import { SignedXml } from 'xml-crypto'

export interface SignOptions {
  privateKeyPem: string
  certificatePem: string
  algo: 'sha1' | 'sha256'
}

const ALGO = {
  sha1: {
    signature: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digest: 'http://www.w3.org/2000/09/xmldsig#sha1',
  },
  sha256: {
    signature: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256',
  },
} as const

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'

/**
 * Assina o elemento `referenceLocalName` (que deve ter atributo `Id`) e insere
 * a <Signature> imediatamente após esse mesmo elemento.
 */
export function signElement(xml: string, referenceLocalName: string, opts: SignOptions): string {
  const algo = ALGO[opts.algo]

  const sig = new SignedXml({
    privateKey: opts.privateKeyPem,
    publicCert: opts.certificatePem,
    signatureAlgorithm: algo.signature,
    canonicalizationAlgorithm: C14N,
    // GINFES espera a chave pública embutida via <X509Certificate>.
    getKeyInfoContent: getKeyInfoContent(opts.certificatePem),
  })

  const xpath = `//*[local-name(.)='${referenceLocalName}']`

  sig.addReference({
    xpath,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: algo.digest,
  })

  sig.computeSignature(xml, {
    location: { reference: xpath, action: 'after' },
  })

  return sig.getSignedXml()
}

/** Monta o <KeyInfo> com o certificado (sem cabeçalhos PEM). */
function getKeyInfoContent(certificatePem: string) {
  const der = certificatePem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')

  return () => `<X509Data><X509Certificate>${der}</X509Certificate></X509Data>`
}
