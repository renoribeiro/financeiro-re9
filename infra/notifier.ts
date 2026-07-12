// ============================================================================
// Serviço de notificações (referência) — item B2 do plano de melhorias.
// Adapters para WhatsApp (Evolution API) e E-mail (SMTP). Sem dependências
// externas aqui; ao ligar, mover para `server/utils/` e instalar `nodemailer`.
// O motor lê `notification_rules` (ativa? canais? antecedência?) e dispara.
// ============================================================================

export type Channel = 'dashboard' | 'whatsapp' | 'email'

export interface OutboundNotification {
  companyId: string
  to: string // telefone (whatsapp) ou e-mail
  title: string
  message: string
  channel: Channel
}

export interface ChannelAdapter {
  send: (n: OutboundNotification) => Promise<{ ok: boolean; error?: string }>
}

/** WhatsApp via Evolution API (já na infra RE9). */
export function evolutionAdapter(cfg: { baseUrl: string; apiKey: string; instance: string }): ChannelAdapter {
  return {
    async send(n) {
      // POST {baseUrl}/message/sendText/{instance}
      const res = await fetch(`${cfg.baseUrl}/message/sendText/${cfg.instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.apiKey },
        body: JSON.stringify({ number: n.to, text: `*${n.title}*\n${n.message}` }),
      })

      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
    },
  }
}

/** E-mail via SMTP (Hostgator). Ao ligar, usar nodemailer.createTransport. */
export function smtpAdapter(_cfg: { host: string; user: string; pass: string }): ChannelAdapter {
  return {
    async send(_n) {
      // const transport = nodemailer.createTransport({ host, auth: { user, pass } })
      // await transport.sendMail({ from, to: n.to, subject: n.title, text: n.message })
      return { ok: true }
    },
  }
}

/** Rate limit simples por número para não bloquear o WhatsApp. */
const lastSentAt = new Map<string, number>()

export function createNotifier(adapters: Partial<Record<Channel, ChannelAdapter>>, minIntervalMs = 1500) {
  return {
    async dispatch(n: OutboundNotification, now: number): Promise<{ ok: boolean; error?: string }> {
      if (n.channel === 'dashboard')
        return { ok: true } // dashboard só persiste no banco
      const last = lastSentAt.get(n.to) ?? 0
      if (now - last < minIntervalMs)
        return { ok: false, error: 'rate_limited' }
      const adapter = adapters[n.channel]
      if (!adapter)
        return { ok: false, error: `sem adapter para ${n.channel}` }
      lastSentAt.set(n.to, now)

      return adapter.send(n)
    },
  }
}
