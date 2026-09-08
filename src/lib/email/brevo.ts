// Brevo (ex-Sendinblue) transactional email API — alternative sending
// provider to direct SMTP. Free tier: 300 emails/día, sin necesidad de
// gestionar SPF/DKIM/reputación de IP propia (Brevo lo maneja).
// Docs: https://developers.brevo.com/reference/sendtransacemail

interface BrevoSendParams {
  apiKey: string
  fromName: string
  fromEmail: string
  to: string
  subject: string
  html: string
}

interface BrevoSendResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendViaBrevo(params: BrevoSendParams): Promise<BrevoSendResult> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': params.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: params.fromName, email: params.fromEmail },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { success: false, error: data?.message || `Brevo error ${res.status}` }
    }
    return { success: true, messageId: data?.messageId }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Verifies an API key without sending anything — used by "Probar conexión".
export async function verifyBrevoKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data?.message || `API key inválida (${res.status})` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
