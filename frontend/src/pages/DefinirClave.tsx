import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Ticket } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

// Destino de las invitaciones: el usuario invitado define su contraseña.
// Supabase crea una sesión al abrir el enlace; aquí solo fijamos la clave.
export default function DefinirClave() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    const next = new URLSearchParams(location.search).get('next')
    navigate(next && next.startsWith('/') ? next : '/admin', { replace: true })
  }

  if (loading)
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600" />
      </div>
    )

  if (!session)
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5 text-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Enlace no válido</h1>
          <p className="mt-2 text-sm text-zinc-600">El enlace de invitación expiró o ya se usó. Pide uno nuevo o inicia sesión.</p>
          <a href="/admin/login" className="mt-6 inline-block text-sm font-medium text-emerald-700 hover:underline">Ir al inicio de sesión</a>
        </div>
      </div>
    )

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
            <Ticket className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            EventPass <span className="text-emerald-600">VE</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Define tu contraseña</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {session.user.email} · crea tu clave para acceder al panel.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Mínimo 8 caracteres"
            />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Guardando…' : 'Guardar y entrar'}
            {!busy && <KeyRound className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}
