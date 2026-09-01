export function credentialQrValue(token: string): string {
  return `${window.location.origin}/credencial/${encodeURIComponent(token)}`
}

export function extractCredentialToken(value: string): string {
  const clean = value.trim()
  if (!clean) return ''
  try {
    const url = new URL(clean)
    const match = url.pathname.match(/\/credencial\/([^/]+)\/?$/)
    if (match?.[1]) return decodeURIComponent(match[1])
  } catch {
    // Compatibilidad con credenciales antiguas que contienen sólo el token.
  }
  return clean
}
