import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, PartyPopper } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { finishOnboarding } from '../lib/onboarding'

type Phase = 'waiting' | 'working' | 'done' | 'error'

export default function Bienvenida() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (loading || ran.current) return
    // Sin sesión (enlace abierto sin confirmar / expirado): al login.
    if (!session) {
      const t = setTimeout(() => navigate('/admin/login', { replace: true }), 2500)
      return () => clearTimeout(t)
    }
    ran.current = true
    setPhase('working')
    finishOnboarding().then(({ error }) => {
      if (error) {
        setError(error)
        setPhase('error')
        return
      }
      setPhase('done')
      setTimeout(() => navigate('/admin', { replace: true }), 1400)
    })
  }, [loading, session, navigate])

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5">
      <div className="w-full max-w-md text-center">
        {phase === 'done' ? (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <PartyPopper className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-900">¡Todo listo!</h1>
            <p className="mt-3 text-sm text-zinc-600">Tu organización está creada. Te llevamos al panel…</p>
          </>
        ) : phase === 'error' ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Casi listo</h1>
            <p className="mt-3 text-sm text-zinc-600">{error}</p>
            <Link to="/admin" className="mt-6 inline-block text-sm font-medium text-emerald-700 hover:underline">
              Ir al panel
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-900">Configurando tu organización</h1>
            <p className="mt-3 text-sm text-zinc-600">Un momento, estamos preparando todo.</p>
          </>
        )}
      </div>
    </div>
  )
}
