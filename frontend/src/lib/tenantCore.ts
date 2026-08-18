import { supabase } from './supabase'

export type Branding = {
  name?: string | null
  logo_url?: string | null
  color?: string | null
}

export type Tenant = {
  id: string
  slug: string
  name: string
  custom_hostname: string | null
  branding: Branding
}

const ROOT_DOMAIN = 'eventosfacil.net'
const RESERVED = new Set(['', 'www', 'app', 'admin', 'api'])

type HostTarget = { slug?: string; customHost?: string }

function parseHost(hostname: string): HostTarget {
  const host = hostname.toLowerCase().split(':')[0]
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return {}
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1)
    if (RESERVED.has(sub) || sub.includes('.')) return {}
    return { slug: sub }
  }
  if (host === 'localhost' || host.startsWith('127.') || host.endsWith('.pages.dev')) return {}
  return { customHost: host }
}

export async function resolveTenant(): Promise<Tenant | null> {
  const params = new URLSearchParams(window.location.search)
  const forced = params.get('org')
  const target: HostTarget = forced ? { slug: forced } : parseHost(window.location.hostname)
  if (!target.slug && !target.customHost) return null

  let query = supabase
    .from('organizations')
    .select('id, slug, name, custom_hostname, branding')
    .eq('status', 'active')
  query = target.slug ? query.eq('slug', target.slug) : query.eq('custom_hostname', target.customHost!)
  const { data } = await query.maybeSingle()
  return (data as Tenant | null) ?? null
}

export function brandName(tenant: Tenant | null): string {
  return tenant?.branding?.name ?? tenant?.name ?? 'EventPass VE'
}

export function brandColor(tenant: Tenant | null): string | null {
  return tenant?.branding?.color ?? null
}
