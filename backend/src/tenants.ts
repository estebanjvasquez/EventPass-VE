// ---------------------------------------------------------------------------
// Aprovisionamiento de subdominios de tenant vía la API de Cloudflare Pages.
//
// Cloudflare Pages NO admite dominios comodín (*.dominio) como custom domain:
// cada hostname debe registrarse explícitamente. La resolución DNS la cubre un
// registro wildcard (CNAME * -> <proyecto>.pages.dev, proxied) creado una sola
// vez; aquí solo registramos <slug>.<ROOT_DOMAIN> como custom domain del
// proyecto para que Pages lo enrute y emita el certificado.
// ---------------------------------------------------------------------------

export type CfEnv = {
  CF_API_TOKEN: string
  CF_ACCOUNT_ID: string
  CF_PAGES_PROJECT: string
  ROOT_DOMAIN: string
  // Opcionales: habilitan la creación automática del registro DNS del
  // subdominio (CNAME <slug> -> <CF_PAGES_HOST>, proxied). Requieren que el
  // token tenga permiso "Zone.DNS: Edit". Si faltan, se omite la parte DNS y
  // se asume que un registro wildcard cubre la resolución.
  CF_ZONE_ID?: string
  CF_PAGES_HOST?: string // p.ej. "eventpass-d7d.pages.dev"
}

// Subdominios reservados para la plataforma (no son tenants).
const RESERVED = new Set([
  '',
  'www',
  'app',
  'admin',
  'api',
  'mail',
  'email',
  'static',
  'assets',
  'cdn',
])

// Valida y normaliza un slug a etiqueta DNS segura (RFC 1035, sin puntos).
export function normalizeSlug(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) return null
  if (RESERVED.has(s)) return null
  return s
}

type CfResult<T = unknown> = {
  success: boolean
  result?: T
  errors?: { code: number; message: string }[]
}

async function cf<T>(env: CfEnv, path: string, init?: RequestInit): Promise<CfResult<T>> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  return (await res.json().catch(() => ({ success: false }))) as CfResult<T>
}

type CfDomain = {
  name: string
  status: string
  validation_data?: { status?: string; method?: string }
  verification_data?: { status?: string }
}

export type DomainStatus = { hostname: string; status: string; validation: string | null }

function projectPath(env: CfEnv): string {
  return `/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.CF_PAGES_PROJECT}/domains`
}

// Estado actual del custom domain, o null si aún no está registrado.
export async function getDomainStatus(env: CfEnv, hostname: string): Promise<DomainStatus | null> {
  const r = await cf<CfDomain>(env, `${projectPath(env)}/${hostname}`)
  if (!r.success || !r.result) return null
  return {
    hostname,
    status: r.result.status,
    validation: r.result.validation_data?.status ?? null,
  }
}

// Estado del registro DNS del subdominio: 'created' | 'exists' | 'skipped'
// (sin CF_ZONE_ID) | 'failed' (p. ej. token sin permiso DNS).
export type DnsState = 'created' | 'exists' | 'skipped' | 'failed'

type CfDnsRecord = { id: string; name: string; type: string; content: string }

// Garantiza el CNAME <hostname> -> <CF_PAGES_HOST> (proxied). Idempotente.
async function ensureDnsRecord(env: CfEnv, hostname: string): Promise<{ state: DnsState; error?: string }> {
  if (!env.CF_ZONE_ID || !env.CF_PAGES_HOST) return { state: 'skipped' }

  const existing = await cf<CfDnsRecord[]>(
    env,
    `/zones/${env.CF_ZONE_ID}/dns_records?name=${hostname}`,
  )
  if (existing.success && (existing.result?.length ?? 0) > 0) return { state: 'exists' }

  const r = await cf<CfDnsRecord>(env, `/zones/${env.CF_ZONE_ID}/dns_records`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'CNAME',
      name: hostname,
      content: env.CF_PAGES_HOST,
      proxied: true,
      comment: 'Subdominio de tenant EventPass (auto)',
    }),
  })
  if (!r.success) return { state: 'failed', error: r.errors?.[0]?.message ?? 'Error DNS' }
  return { state: 'created' }
}

export type ProvisionResult =
  | { ok: true; hostname: string; status: string; dns: DnsState; dnsError?: string }
  | { ok: false; hostname: string; error: string }

// Aprovisiona el subdominio: (1) crea el registro DNS si hay permiso, y
// (2) registra <slug>.<ROOT_DOMAIN> como custom domain del proyecto Pages.
// Ambos pasos son idempotentes.
export async function provisionDomain(env: CfEnv, slug: string): Promise<ProvisionResult> {
  const hostname = `${slug}.${env.ROOT_DOMAIN}`

  const dns = await ensureDnsRecord(env, hostname)

  const existing = await getDomainStatus(env, hostname)
  if (existing) return { ok: true, hostname, status: existing.status, dns: dns.state, dnsError: dns.error }

  const r = await cf<CfDomain>(env, projectPath(env), {
    method: 'POST',
    body: JSON.stringify({ name: hostname }),
  })
  if (!r.success) {
    return { ok: false, hostname, error: r.errors?.[0]?.message ?? 'Error de Cloudflare' }
  }
  return { ok: true, hostname, status: r.result?.status ?? 'initializing', dns: dns.state, dnsError: dns.error }
}
