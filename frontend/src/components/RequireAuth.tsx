import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import AuthenticatedHeader from './AuthenticatedHeader'
import EventAdminWorkspace from './EventAdminWorkspace'
import { platformUrl, useAdminMode } from '../lib/adminNavigation'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  const mode = useAdminMode()
  const [access, setAccess] = useState<{ checked: boolean; allowed: boolean; userId?: string; platform?: boolean; reason?: string; error?: string }>({ checked: false, allowed: false })

  useEffect(() => {
    let active = true
    if (!session) { setAccess({ checked: true, allowed: false }); return }
    void supabase.rpc('current_platform_access').then(({ data, error }) => {
      if (!active) return
      if (error || !data) { setAccess({ checked: true, userId: session.user.id, allowed: false, error: 'No se pudo comprobar tu acceso. Vuelve a intentarlo.' }); return }
      const state = data as { is_platform_admin?: boolean; user_suspended?: boolean; has_active_organization?: boolean; suspension_reason?: string }
      setAccess({
        checked: true,
        userId: session.user.id,
        platform: state.is_platform_admin === true,
        allowed: state.is_platform_admin === true || (state.user_suspended !== true && state.has_active_organization === true),
        reason: state.suspension_reason,
      })
    })
    return () => { active = false }
  }, [session])

  if (loading || (session && (!access.checked || access.userId !== session.user.id))) {
    return (
      <div className="grid min-h-[100dvh] place-items-center text-sm text-zinc-500">
        Cargando…
      </div>
    )
  }

  if (!session) return <Navigate to="/admin/login" replace />
  if (access.error) return <div className="grid min-h-[100dvh] place-items-center p-6 text-center"><div><p role="alert">{access.error}</p><button onClick={() => window.location.reload()} className="mt-4 text-emerald-700 underline">Reintentar</button></div></div>
  if (access.platform && mode === 'platform' && location.pathname.startsWith('/admin')) return <Navigate to={platformUrl()} replace />

  if (!access.allowed) return <div className="grid min-h-[100dvh] place-items-center bg-zinc-50 px-5 text-center"><div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold text-zinc-900">Acceso pausado</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Tu acceso o la organización están temporalmente pausados. {access.reason ? `Motivo: ${access.reason}` : 'Contacta al equipo de soporte para revisar el estado de la cuenta.'}</p><Link to="/" className="mt-6 inline-block text-sm font-semibold text-emerald-700 hover:underline">Volver al inicio</Link></div></div>

  if (location.pathname.startsWith('/superadmin') && !access.platform) return <Navigate to="/admin" replace />
  return <><AuthenticatedHeader /><EventAdminWorkspace>{children}</EventAdminWorkspace></>
}
