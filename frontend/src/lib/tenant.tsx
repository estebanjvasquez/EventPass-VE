import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { resolveTenant, type Tenant } from './tenantCore'
import { TenantContext } from './tenantContext'

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
