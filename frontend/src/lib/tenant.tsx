import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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

// Dominio raíz de los subdominios de tenant (<slug>.eventosfacil.net).
const ROOT_DOMAIN = 'eventosfacil.net'
// Subdominios que NO son tenants (marketing / plataforma).
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
  // Desarrollo / preview: sin tenant salvo override por query (?org=slug).
  if (host === 'localhost' || host.startsWith('127.') || host.endsWith('.pages.dev')) {
    return {}
  }
  // Cualquier otro hostname se trata como dominio propio (premium).
  return { customHost: host }
}

export async function resolveTenant(): Promise<Tenant | null> {
  const params = new URLSearchParams(window.location.search)
  const forced = params.get('org') // override para pruebas locales
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

type TenantContextValue = { tenant: Tenant | null; loading: boolean }
const TenantContext = createContext<TenantContextValue | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    resolveTenant().then((t) => {
      if (!active) return
      setTenant(t)
      setLoading(false)
      if (t) {
        const brandColor = t.branding?.color
        document.title = `${t.branding?.name ?? t.name} — Registro`
        if (brandColor) document.documentElement.style.setProperty('--brand', brandColor)
      }
    })
    return () => {
      active = false
    }
  }, [])

  return <TenantContext.Provider value={{ tenant, loading }}>{children}</TenantContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant debe usarse dentro de <TenantProvider>')
  return ctx
}

// Nombre y color efectivos (branding o valores por defecto).
export function brandName(tenant: Tenant | null): string {
  return tenant?.branding?.name ?? tenant?.name ?? 'EventPass VE'
}
export function brandColor(tenant: Tenant | null): string | null {
  return tenant?.branding?.color ?? null
}
