import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Ticket } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function RecuperarClave() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/definir-clave`,
    })
    setBusy(false)
    if (error) setError('No pudimos enviar el correo. Intenta nuevamente en unos minutos.')
    else setSent(true)
  }

  return <div className="grid min-h-[100dvh] place-items-center bg-[#fafafa] px-5"><div className="w-full max-w-sm">
    <Link to="/admin/login" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"><ArrowLeft className="h-4 w-4" />Volver al inicio de sesión</Link>
    <div className="mt-8 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400"><Ticket className="h-5 w-5" /></span><span className="text-lg font-semibold text-zinc-900">EventPass <span className="text-emerald-600">VE</span></span></div>
    <h1 className="mt-8 text-2xl font-bold tracking-tight text-zinc-900">Recuperar contraseña</h1>
    <p className="mt-2 text-sm text-zinc-600">Te enviaremos un enlace seguro para definir una nueva contraseña.</p>
    {sent ? <div className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Mail className="mb-2 h-5 w-5" />Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.</div> : <form onSubmit={submit} className="mt-7 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium text-zinc-800">Correo electrónico<input required autoComplete="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 font-normal outline-none focus:border-emerald-500" /></label>{error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="rounded-lg bg-zinc-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Enviando…' : 'Enviar enlace de recuperación'}</button></form>}
  </div></div>
}
