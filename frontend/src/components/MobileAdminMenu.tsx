import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarCog, Handshake, IdCard, LayoutDashboard, LogOut, Menu, ScanLine, ShieldCheck, Ticket, Users, X } from 'lucide-react'
import { useAuth } from '../lib/auth'

const links = [
  { href: '/admin', label: 'Inicio', icon: LayoutDashboard },
  { href: '/admin/registros', label: 'Registros', icon: Ticket },
  { href: '/admin/eventos', label: 'Eventos', icon: CalendarCog },
  { href: '/admin/acreditacion', label: 'Acreditación', icon: IdCard },
  { href: '/admin/checkin', label: 'Check-in', icon: ScanLine },
  { href: '/admin/equipo-operativo', label: 'Equipo operativo', icon: Users },
  { href: '/admin/patrocinantes', label: 'Patrocinantes', icon: Handshake },
]

export default function MobileAdminMenu() {
  const location = useLocation()
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/superadmin')
  if (!isAdminRoute || location.pathname === '/admin/login') return null

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="fixed right-3 top-3 z-[110] inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 bg-white text-zinc-800 shadow-lg md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/30 md:hidden" onClick={() => setOpen(false)}>
          <nav
            aria-label="Navegación administrativa"
            className="absolute right-3 top-16 max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} to={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800">
                <Icon className="h-4 w-4 text-emerald-700" />{label}
              </Link>
            ))}
            <Link to="/admin/suscripcion" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-emerald-50 hover:text-emerald-800"><ShieldCheck className="h-4 w-4 text-emerald-700" />Suscripción</Link>
            <button type="button" onClick={() => { setOpen(false); void signOut() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-zinc-700 hover:bg-red-50 hover:text-red-700"><LogOut className="h-4 w-4" />Salir</button>
          </nav>
        </div>
      )}
    </>
  )
}
