import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

type Member = { id: string; first_name: string; last_name: string | null; rsvp: string; table_name: string | null; credential_token: string | null }
type Household = { event_name: string; household_name: string; members: Member[] }
const api = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
function requestKey() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, '0')).join('') }

export default function PrivateInvitation() {
  const { eventId, mode } = useParams()
  const route = useLocation()
  const social = mode === 'hogar'
  // Fragment secrets are not included in HTTP URLs or analytics page paths.
  const [code, setCode] = useState(() => location.hash.slice(1))
  const [request, setRequest] = useState('')
  const [household, setHousehold] = useState<Household | null>(null)
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { const key = `invitation-request:${eventId}`; const value = sessionStorage.getItem(key) ?? requestKey(); sessionStorage.setItem(key, value); setRequest(value); setCode(route.hash.slice(1)); setHousehold(null); setCredential(''); setMessage('') }, [eventId, mode, route.hash])
  async function send(path: string, payload: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`${api}/api/invitations/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, code: code.trim(), ...payload }), referrerPolicy: 'no-referrer' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'No se pudo completar la solicitud')
      if (social) setHousehold(data); else setCredential(data.credential_token)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo conectar') }
    finally { setBusy(false) }
  }
  return <main className="mx-auto max-w-xl space-y-6 p-6"><Link to="/" className="text-emerald-700 underline">Inicio</Link>
    <h1 className="text-3xl font-bold">{social ? 'Tu invitación y confirmación' : 'Registro por invitación'}</h1>
    <p>{social ? 'El enlace permite al representante gestionar las respuestas de su grupo. Consérvalo en privado.' : 'Cada código permite registrar a una sola persona y habilita los accesos asignados por el organizador.'}</p>
    {message && <p role="alert" className="rounded bg-amber-50 p-3">{message}</p>}
    {credential ? <section className="space-y-4 rounded border p-5"><h2 className="text-xl font-semibold">Registro confirmado</h2><Link className="text-emerald-700 underline" to={`/credencial/${credential}`}>Abrir mi credencial</Link><p>Conserva el enlace de tu credencial. Puedes recuperar el registro verificando tu correo.</p></section> : !household ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void send(social ? 'household' : 'redeem', social ? {} : { request, first_name: f.get('first_name'), last_name: f.get('last_name'), email: f.get('email'), phone: f.get('phone') }) }}>
      <label className="block">Código de invitación<input className="mt-1 w-full rounded border p-2" value={code} onChange={e => setCode(e.target.value)} required autoComplete="off" /></label>
      {!social && <><label className="block">Nombre<input name="first_name" minLength={2} maxLength={120} required className="mt-1 w-full rounded border p-2" /></label><label className="block">Apellido<input name="last_name" maxLength={120} className="mt-1 w-full rounded border p-2" /></label><label className="block">Correo<input name="email" type="email" required className="mt-1 w-full rounded border p-2" /></label><label className="block">Teléfono<input name="phone" maxLength={60} className="mt-1 w-full rounded border p-2" /></label></>}
      <button disabled={busy} className="rounded bg-emerald-700 px-4 py-2 text-white">{busy ? 'Procesando…' : social ? 'Ver mi grupo' : 'Confirmar registro'}</button>
    </form> : <section className="space-y-4"><h2 className="text-xl font-semibold">{household.event_name} · {household.household_name}</h2>{household.members.map(m => <form key={m.id} className="space-y-3 rounded border p-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void send('household', { member_id: m.id, response: f.get('response'), first_name: f.get('first_name'), last_name: f.get('last_name') }) }}>
      <label className="block">Nombre<input name="first_name" defaultValue={m.first_name} readOnly={m.rsvp === 'accepted'} required minLength={2} className="w-full rounded border p-2" /></label><label className="block">Apellido<input name="last_name" defaultValue={m.last_name ?? ''} readOnly={m.rsvp === 'accepted'} className="w-full rounded border p-2" /></label>
      <p>Respuesta: {({ pending: 'Pendiente', accepted: 'Asistirá', declined: 'No asistirá' } as Record<string, string>)[m.rsvp]}{m.table_name ? ` · Mesa ${m.table_name}` : ''}</p>
      <select name="response" aria-label="Respuesta de asistencia" defaultValue={m.rsvp === 'declined' ? 'declined' : 'accepted'} className="rounded border p-2"><option value="accepted">Asistiré</option><option value="declined">No asistiré</option></select>{' '}<button disabled={busy} className="rounded bg-emerald-700 px-3 py-2 text-white">Guardar respuesta</button>
      {m.credential_token && <Link className="block text-emerald-700 underline" to={`/credencial/${m.credential_token}`}>Ver credencial</Link>}
    </form>)}<p>Si declinaste y deseas volver a confirmar, contacta al planner para revisar el cupo.</p></section>}
  </main>
}
