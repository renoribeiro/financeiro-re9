import { spawnSync } from 'node:child_process'

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const audit = spawnSync(command, ['audit', '--prod', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

let report
try {
  const jsonStart = audit.stdout.indexOf('{')
  if (jsonStart < 0)
    throw new Error('Relatório JSON ausente')

  report = JSON.parse(audit.stdout.slice(jsonStart))
}
catch {
  console.error('Não foi possível interpretar o relatório de auditoria de dependências.')
  process.exit(1)
}

const acceptedExceptions = new Map([
  [
    'GHSA-vfj7-8cjw-p6xm',
    'braces é usado apenas por ferramentas de build; a imagem final contém somente .output.',
  ],
  [
    'GHSA-86w9-cpqp-85rv',
    'node-forge é usado para ler o A1 e assinar XML, não para verificar assinaturas PKCS#1 v1.5 não confiáveis.',
  ],
])

const findings = Object.values(report.advisories ?? {})
const unexpected = findings.filter(item => !acceptedExceptions.has(item.github_advisory_id))

if (unexpected.length) {
  console.error('Foram encontradas vulnerabilidades sem exceção aprovada:')
  for (const finding of unexpected)
    console.error(`- ${finding.github_advisory_id ?? finding.id}: ${finding.module_name} (${finding.severity})`)

  process.exit(1)
}

for (const finding of findings)
  console.warn(`Exceção revisada: ${finding.github_advisory_id} — ${acceptedExceptions.get(finding.github_advisory_id)}`)

console.log('Auditoria de dependências aprovada: nenhuma vulnerabilidade não revisada foi encontrada.')
