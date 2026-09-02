import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Building2, CalendarCog, ChevronDown, CircleUserRound, ClipboardList, Handshake, IdCard, LayoutDashboard, LogOut, ScanLine, ShieldCheck, Ticket, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { clearImpersonation, resolveActiveOrg } from '../lib/activeOrg'
import { supabase } from '../lib/supabase'

type Brand = { name?: string | null; logo_url?: string | null; color?: string | null }

type HeaderState = {
  organizationName: string
  branding: Brand
  isPlatformAdmin: boolean
  impersonating: boolean
}

const navigation = [
  { to: '/admin', label: 'Inicio', icon: LayoutDashboard },
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarCog },
  { to: '/admin/registros', label: 'Registros', icon: ClipboardList },
  { to: '/admin/acreditacion', label: 'Acreditación', icon: IdCard },
  { to: '/admin/checkin', label: 'Check-in', icon: ScanLine },
  { to: '/admin/equipo-operativo', label: 'Equipo operativo', icon: Users },
  { to: '/admin/patrocinantes', label: 'Patrocinantes', icon: Handshake },
]

export default function AuthenticatedHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<HeaderState>({ organizationName: 'Organización', branding: {}, isPlatformAdmin: false, impersonating: false })

  useEffect(() => {
    let active = true
    async function load() {
      const [organization, platform] = await Promise.all([resolveActiveOrg(), supabase.rpc('is_platform_admin')])
      if (!active) return
      const isPlatformAdmin = platform.data === true
      if (!organization) {
        setState({ organizationName: 'EventPass VE', branding: {}, isPlatformAdmin, impersonating: false })
        return
      }
      const { data } = await supabase.from('organizations').select('name,branding').eq('id', organization.organization_id).maybeSingle()
      if (!active) return
      setState({
        organizationName: (data as { name?: string } | null)?.name ?? organization.organizations?.name ?? 'Organización',
        branding: ((data as { branding?: Brand } | null)?.branding ?? {}),
        isPlatformAdmin,
        impersonating: organization.impersonating,
      })
    }
    void load()
    return () => { active = false }
  }, [location.pathname])

  async function leave() {
    setOpen(false)
    clearImpersonation()
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  const brandName = state.branding.name ?? state.organizationName
  const accent = state.branding.color ?? '#059669'

  return <header className="sticky top-0 z-[120] border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur">
    <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
      <Link to="/admin" className="flex min-w-0 items-center gap-3" aria-label="Ir al inicio del organizador">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-950 text-emerald-300" aria-hidden="true"><Ticket className="h-5 w-5" /></span>
        <div className="hidden min-w-0 sm:block"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">EventosFácil</p><p className="truncate text-sm font-semibold text-zinc-900">Panel de organización</p></div>
      </Link>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="hidden min-w-0 items-center gap-2 border-r border-zinc-200 pr-3 md:flex">
          {state.branding.logo_url ? <img src={state.branding.logo_url} alt="" className="h-9 w-16 rounded-lg border border-zinc-100 bg-white object-contain p-1" /> : <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50" style={{ color: accent }}><Building2 className="h-4 w-4" /></span>}
          <div className="min-w-0"><p className="max-w-56 truncate text-sm font-semibold text-zinc-900">{brandName}</p><p className="text-xs text-zinc-500">{state.impersonating ? 'Vista de cliente' : 'Organización activa'}</p></div>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setOpen(value => !value)} aria-label="Abrir menú de usuario" aria-expanded={open} className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-300 bg-white px-2.5 text-zinc-700 transition hover:border-emerald-400 hover:text-emerald-800">
            <CircleUserRound className="h-5 w-5" />
            <span className="hidden max-w-36 truncate text-sm font-semibold lg:block">{user?.email ?? 'Mi cuenta'}</span>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          {open && <div className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
            <div className="border-b border-zinc-100 px-4 py-3 md:hidden"><p className="truncate text-sm font-bold text-zinc-900">{brandName}</p><p className="mt-0.5 text-xs text-zinc-500">Organización activa</p></div>
            <div className="border-b border-zinc-100 px-4 py-3"><p className="truncate text-sm font-semibold text-zinc-900">{user?.email ?? 'Sesión activa'}</p><p className="mt-0.5 text-xs text-zinc-500">Accesos y navegación</p></div>
            <nav aria-label="Navegación de usuario" className="max-h-[min(60dvh,30rem)] overflow-y-auto p-2">
              {navigation.map(({ to, label, icon: Icon }) => <Link key={to} to={to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-emerald-50 hover:text-emerald-900"><Icon className="h-4 w-4 text-emerald-700" />{label}</Link>)}
              <Link to="/admin/suscripcion" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-emerald-50 hover:text-emerald-900"><ShieldCheck className="h-4 w-4 text-emerald-700" />Suscripción</Link>
              {state.isPlatformAdmin && <Link to="/superadmin" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-bold text-violet-900 hover:bg-violet-100"><ShieldCheck className="h-4 w-4 text-violet-700" />Ir a Superadmin</Link>}
            </nav>
            <div className="border-t border-zinc-100 p-2"><button type="button" onClick={() => void leave()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" />Cerrar sesión</button></div>
          </div>}
        </div>
      </div>
    </div>
    {open && <button type="button" aria-label="Cerrar menú de usuario" className="fixed inset-0 -z-10 cursor-default" onClick={() => setOpen(false)} />}
  </header>
}
