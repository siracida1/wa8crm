/** Appends a sender's HTML signature to an email body, before
 *  </body> when present. Applied BEFORE tracking-pixel wrapping so any
 *  links inside the signature itself get click-tracked too. */
export function appendSignature(html: string, signatureHtml: string | null | undefined): string {
  if (!signatureHtml?.trim()) return html
  const block = `<div>${signatureHtml}</div>`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${block}</body>`)
  }
  return `${html}${block}`
}
