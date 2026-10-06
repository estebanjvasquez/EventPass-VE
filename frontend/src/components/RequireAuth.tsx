import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import AuthenticatedHeader from './AuthenticatedHeader'
import EventAdminWorkspace from './EventAdminWorkspace'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const [access, setAccess] = useState<{ checked: boolean; allowed: boolean; reason?: string }>({ checked: false, allowed: true })

  useEffect(() => {
    if (!session) { setAccess({ checked: true, allowed: true }); return }
    void supabase.rpc('current_platform_access').then(({ data, error }) => {
      if (error || !data) { setAccess({ checked: true, allowed: true }); return }
      const state = data as { is_platform_admin?: boolean; user_suspended?: boolean; has_active_organization?: boolean; suspension_reason?: string }
      setAccess({
        checked: true,
        allowed: state.is_platform_admin === true || (state.user_suspended !== true && state.has_active_organization === true),
        reason: state.suspension_reason,
      })
    })
  }, [session])

  if (loading || (session && !access.checked)) {
    return (
      <div className="grid min-h-[100dvh] place-items-center text-sm text-zinc-500">
        Cargando…
      </div>
    )
  }

  if (!session) return <Navigate to="/admin/login" replace />

  if (!access.allowed) return <div className="grid min-h-[100dvh] place-items-center bg-zinc-50 px-5 text-center"><div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold text-zinc-900">Acceso pausado</h1><p className="mt-3 text-sm leading-6 text-zinc-600">Tu acceso o la organización están temporalmente pausados. {access.reason ? `Motivo: ${access.reason}` : 'Contacta al equipo de soporte para revisar el estado de la cuenta.'}</p><Link to="/" className="mt-6 inline-block text-sm font-semibold text-emerald-700 hover:underline">Volver al inicio</Link></div></div>

  return <><AuthenticatedHeader /><EventAdminWorkspace>{children}</EventAdminWorkspace></>
}
