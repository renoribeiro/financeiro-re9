// ============================================================================
// Certificado digital A1 (.pfx / PKCS#12) — carregamento SERVER-SIDE.
//
// ⚠️ Roda SOMENTE no servidor (pasta server/ nunca vai ao bundle do cliente).
// O certificado e a senha JAMAIS são expostos ao browser. São lidos do
// ambiente (env do Dokploy) em runtime, decodificados e mantidos só em memória.
//
// Fornece:
//   • PEM da chave privada + do certificado  → para assinar o XML (XMLDSig)
//   • Buffer .pfx + passphrase               → para o mTLS (client cert) do
//                                              webservice da SEFIN
//   • Metadados (titular, validade, CNPJ)    → para status/alertas
//
// Formas de fornecer o A1 (qualquer uma):
//   • NFSE_CERT_PFX_BASE64  = conteúdo do .pfx em base64  (recomendado no Dokploy)
//   • NFSE_CERT_PFX_PATH    = caminho de um .pfx montado em volume
//   • NFSE_CERT_PASSWORD    = senha do certificado
// ============================================================================
import { readFileSync } from 'node:fs'
import forge from 'node-forge'

export interface LoadedCertificate {
  /** Buffer bruto do .pfx (para o https.Agent / mTLS). */
  pfx: Buffer
  passphrase: string
  /** Chave privada em PEM (para assinatura XMLDSig). */
  privateKeyPem: string
  /** Certificado (folha) em PEM. */
  certificatePem: string
  /** Cadeia completa em PEM (folha + intermediários), se disponível. */
  certificateChainPem: string[]
  /** Titular do certificado (CN). */
  subjectCN: string
  /** CNPJ/CPF extraído do titular, se presente. */
  holderDocument?: string
  /** Início da validade (ISO). */
  notBefore: string
  /** Fim da validade (ISO). */
  notAfter: string
}

let cached: LoadedCertificate | null = null
let cacheKey = ''

/** Lê o .pfx do ambiente (base64 ou arquivo). Retorna null se não configurado. */
function readPfxBuffer(): Buffer | null {
  const b64 = process.env.NFSE_CERT_PFX_BASE64?.trim()
  if (b64)
    return Buffer.from(b64, 'base64')

  const path = process.env.NFSE_CERT_PFX_PATH?.trim()
  if (path)
    return readFileSync(path)

  return null
}

/** Indica se há um certificado A1 configurado no ambiente (sem carregá-lo). */
export function isCertificateConfigured(): boolean {
  return Boolean(
    (process.env.NFSE_CERT_PFX_BASE64?.trim() || process.env.NFSE_CERT_PFX_PATH?.trim())
    && process.env.NFSE_CERT_PASSWORD,
  )
}

/**
 * Carrega e faz o parse do certificado A1. Resultado é cacheado em memória
 * (invalidado se o env mudar). Lança erro claro se algo estiver ausente/errado.
 */
export function loadCertificate(): LoadedCertificate {
  const pfx = readPfxBuffer()
  const passphrase = process.env.NFSE_CERT_PASSWORD ?? ''

  if (!pfx)
    throw new Error('Certificado A1 não configurado: defina NFSE_CERT_PFX_BASE64 ou NFSE_CERT_PFX_PATH.')
  if (!passphrase)
    throw new Error('Senha do certificado A1 ausente: defina NFSE_CERT_PASSWORD.')

  // Cache por hash do conteúdo+senha para não reparsear a cada requisição.
  const key = `${pfx.length}:${pfx.subarray(0, 32).toString('hex')}:${passphrase.length}`
  if (cached && cacheKey === key)
    return cached

  const parsed = parsePfx(pfx, passphrase)
  cached = parsed
  cacheKey = key

  return parsed
}

function parsePfx(pfx: Buffer, passphrase: string): LoadedCertificate {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const der = forge.util.createBuffer(pfx.toString('binary'))
    const asn1 = forge.asn1.fromDer(der)
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase)
  }
  catch (err) {
    throw new Error(`Falha ao abrir o certificado A1 (senha incorreta ou arquivo inválido): ${(err as Error).message}`)
  }

  // Chave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []
  const keyBag = keyBags[0]
    ?? (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])[0]
  if (!keyBag?.key)
    throw new Error('Certificado A1 sem chave privada legível.')
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key)

  // Certificados (folha + cadeia)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  if (!certBags.length)
    throw new Error('Certificado A1 sem certificado X.509.')

  const certs = certBags.map(b => b.cert).filter(Boolean) as forge.pki.Certificate[]

  // A folha é a que casa com a chave privada (fallback: a primeira / não-CA).
  const leaf = certs.find(c => c.publicKey && keyBag.key
    && forge.pki.publicKeyToPem(c.publicKey) === forge.pki.publicKeyToPem((keyBag.key as forge.pki.rsa.PrivateKey & { publicKey?: forge.pki.PublicKey }).publicKey ?? c.publicKey))
    ?? certs.find(c => !isCa(c))
    ?? certs[0]

  const certificatePem = forge.pki.certificateToPem(leaf)
  const certificateChainPem = certs.map(c => forge.pki.certificateToPem(c))

  const subjectCN = (leaf.subject.getField('CN')?.value as string) ?? ''

  return {
    pfx,
    passphrase,
    privateKeyPem,
    certificatePem,
    certificateChainPem,
    subjectCN,
    holderDocument: extractDocument(subjectCN),
    notBefore: leaf.validity.notBefore.toISOString(),
    notAfter: leaf.validity.notAfter.toISOString(),
  }
}

function isCa(cert: forge.pki.Certificate): boolean {
  const bc = cert.getExtension('basicConstraints') as { cA?: boolean } | undefined

  return Boolean(bc?.cA)
}

/** e-CNPJ/e-CPF ICP-Brasil trazem o documento no CN após ':' (ex.: "EMPRESA:32198745000110"). */
function extractDocument(cn: string): string | undefined {
  const m = cn.match(/:(\d{11}|\d{14})\b/)

  return m?.[1]
}

/**
 * Cria as opções de mTLS (client cert) para o https.Agent do Node.
 * O Node aceita o .pfx bruto + passphrase diretamente na camada TLS.
 */
export function getTlsOptions(): { pfx: Buffer; passphrase: string } {
  const cert = loadCertificate()

  return { pfx: cert.pfx, passphrase: cert.passphrase }
}

/** Zera o cache (ex.: após troca de certificado). */
export function clearCertificateCache(): void {
  cached = null
  cacheKey = ''
}
