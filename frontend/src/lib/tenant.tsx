import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { resolveTenant, type Tenant } from './tenantCore'
import { TenantContext } from './tenantContext'

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

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
    }).catch(() => { if (active) { setFailed(true); setLoading(false) } })
    return () => {
      active = false
    }
  }, [])

  if (failed) return <main className="p-8"><h1 className="text-2xl font-bold">Sitio no disponible</h1><p className="mt-3">No pudimos verificar esta dirección. Vuelve a intentarlo más tarde.</p></main>
  return <TenantContext.Provider value={{ tenant, loading }}>{children}</TenantContext.Provider>
}
