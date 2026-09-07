import { promises as dns } from 'node:dns'

// Common DKIM selectors across providers people actually use for
// sending — Google Workspace, Microsoft 365, and the handful of
// defaults shared hosting panels (cPanel/Plesk/Ferozo) ship with. A
// selector the user knows (from their provider's setup docs) is always
// checked first/in addition, since there's no way to discover the
// right one from DNS alone.
const COMMON_SELECTORS = ['google', 'selector1', 'selector2', 'default', 'dkim', 'mail', 's1', 'k1']

export interface CheckResult {
  found: boolean
  record?: string
  issues: string[]
}

export interface DkimResult extends CheckResult {
  /** Selector(s) that actually resolved, if any. */
  selectorsFound: string[]
}

export interface DeliverabilityReport {
  domain: string
  spf: CheckResult
  dkim: DkimResult
  dmarc: CheckResult
}

async function lookupTxt(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name)
    return records.map((chunks) => chunks.join(''))
  } catch {
    return []
  }
}

function checkSpf(records: string[]): CheckResult {
  const spf = records.find((r) => r.toLowerCase().startsWith('v=spf1'))
  if (!spf) {
    return {
      found: false,
      issues: [
        'No hay un registro SPF. Sin uno, cualquier servidor puede enviar en nombre de tu dominio y los proveedores de mail lo penalizan — agregá un TXT en la raíz del dominio empezando con "v=spf1".',
      ],
    }
  }
  const issues: string[] = []
  if (/[+]all\b/.test(spf)) {
    issues.push('El SPF termina en "+all", que permite que CUALQUIER servidor envíe como vos — cambialo a "~all" o "-all".')
  } else if (!/[~-]all\b/.test(spf)) {
    issues.push('El SPF no tiene un mecanismo "all" final ("~all" o "-all") — sin eso, no queda claro qué hacer con servidores no listados.')
  }
  return { found: true, record: spf, issues }
}

function checkDmarc(records: string[]): CheckResult {
  const dmarc = records.find((r) => r.toLowerCase().startsWith('v=dmarc1'))
  if (!dmarc) {
    return {
      found: false,
      issues: [
        'No hay un registro DMARC. Agregá un TXT en "_dmarc.<tu-dominio>" con algo como "v=DMARC1; p=none; rua=mailto:vos@tu-dominio.com" para empezar a monitorear sin bloquear nada.',
      ],
    }
  }
  const issues: string[] = []
  const policyMatch = dmarc.match(/p=(\w+)/i)
  const policy = policyMatch?.[1]?.toLowerCase()
  if (policy === 'none') {
    issues.push('La política es "p=none" — solo monitorea, no protege activamente. Una vez que SPF/DKIM estén sólidos, considerá pasar a "p=quarantine" o "p=reject".')
  }
  return { found: true, record: dmarc, issues }
}

/**
 * Checks SPF and DMARC (both discoverable purely from the domain) and
 * DKIM (only discoverable if you know or guess the selector — checks
 * every common one plus any the caller supplies).
 */
export async function checkDeliverability(
  domain: string,
  extraSelectors: string[] = [],
): Promise<DeliverabilityReport> {
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const [rootTxt, dmarcTxt] = await Promise.all([
    lookupTxt(cleanDomain),
    lookupTxt(`_dmarc.${cleanDomain}`),
  ])

  const selectorsToTry = Array.from(new Set([...extraSelectors.filter(Boolean), ...COMMON_SELECTORS]))
  const dkimResults = await Promise.all(
    selectorsToTry.map(async (selector) => ({
      selector,
      records: await lookupTxt(`${selector}._domainkey.${cleanDomain}`),
    })),
  )
  const foundDkim = dkimResults.filter((r) => r.records.length > 0)

  const dkim: DkimResult =
    foundDkim.length > 0
      ? {
          found: true,
          record: foundDkim[0].records[0],
          selectorsFound: foundDkim.map((r) => r.selector),
          issues: [],
        }
      : {
          found: false,
          selectorsFound: [],
          issues: [
            `No encontramos un registro DKIM en los selectores probados (${selectorsToTry.join(', ')}). Si tu proveedor usa un selector distinto, pasámelo — sin DKIM, los mensajes se firman peor y es más fácil que terminen en spam.`,
          ],
        }

  return {
    domain: cleanDomain,
    spf: checkSpf(rootTxt),
    dkim,
    dmarc: checkDmarc(dmarcTxt),
  }
}
