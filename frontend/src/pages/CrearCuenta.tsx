import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, MailCheck, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { finishOnboarding, slugAvailable, slugify } from '../lib/onboarding'

const ROOT_DOMAIN = 'eventosfacil.net'
const inputCls =
  'rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

export default function CrearCuenta() {
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // El slug sigue al nombre hasta que el usuario lo edite manualmente.
  const effectiveSlug = slugEdited ? slug : slugify(orgName)

  useEffect(() => {
    setAvailable(null)
    const s = effectiveSlug
    if (!s || s.length < 3) return
    setChecking(true)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const ok = await slugAvailable(s)
      setAvailable(ok)
      setChecking(false)
    }, 400)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [effectiveSlug])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!orgName.trim()) return setError('Escribe el nombre de tu organización.')
    if (effectiveSlug.length < 3) return setError('El subdominio debe tener al menos 3 caracteres.')
    if (available === false) return setError('Ese subdominio no está disponible.')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')

    setBusy(true)
    const { data, error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/bienvenida`,
        data: { org_name: orgName.trim(), org_slug: effectiveSlug, full_name: fullName.trim() || null },
      },
    })

    if (signErr) {
      setBusy(false)
      setError(
        /already registered|exists/i.test(signErr.message)
          ? 'Ya existe una cuenta con ese correo. Inicia sesión.'
          : signErr.message,
      )
      return
    }

    // Si el proyecto no exige confirmación, ya hay sesión: completamos aquí.
    if (data.session) {
      await finishOnboarding()
      navigate('/admin', { replace: true })
      return
    }
    setBusy(false)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <MailCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-zinc-900">Revisa tu correo</h1>
          <p className="mt-3 text-sm text-zinc-600">
            Enviamos un enlace de confirmación a <strong>{email}</strong>. Al abrirlo, tu organización{' '}
            <strong>{orgName}</strong> quedará lista en{' '}
            <strong>
              {effectiveSlug}.{ROOT_DOMAIN}
            </strong>
            .
          </p>
          <Link to="/admin/login" className="mt-6 inline-block text-sm font-medium text-emerald-700 hover:underline">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
            <Ticket className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            EventPass <span className="text-emerald-600">VE</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Crea tu organización</h1>
        <p className="mt-2 text-sm text-zinc-600">Empieza gratis. Tendrás tu propio subdominio en minutos.</p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Nombre de la organización</span>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} required className={inputCls} placeholder="Asociación de Vecinos El Ávila" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Subdominio</span>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-zinc-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
              <input
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(slugify(e.target.value))
                }}
                className="min-w-0 flex-1 px-3.5 py-2.5 text-sm text-zinc-900 outline-none"
                placeholder="mi-organizacion"
              />
              <span className="flex items-center whitespace-nowrap bg-zinc-50 px-3 text-sm text-zinc-500">.{ROOT_DOMAIN}</span>
            </div>
            {effectiveSlug.length >= 3 && (
              <span className={`text-xs ${available === false ? 'text-red-600' : available ? 'text-emerald-700' : 'text-zinc-400'}`}>
                {checking ? 'Comprobando…' : available === false ? 'No disponible' : available ? 'Disponible ✓' : ' '}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Tu nombre</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Nombre y apellido" />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Correo electrónico</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Contraseña</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputCls} placeholder="Mínimo 8 caracteres" />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || available === false || checking}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Creando…' : 'Crear organización'}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          ¿Ya tienes cuenta?{' '}
          <Link to="/admin/login" className="font-medium text-emerald-700 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
