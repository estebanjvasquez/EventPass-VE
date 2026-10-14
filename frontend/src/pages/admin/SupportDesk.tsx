import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import EventPreparation from '../../components/EventPreparation'
import SupportConversation from '../../components/SupportConversation'

type Ticket = { id: string; title: string; description: string; organization_name: string; event_name: string | null; event_id: string | null; status: string; severity: string; assigned_to: string | null; response_note: string | null; updated_at: string }
export default function SupportDesk() {
  const { session, loading, signOut } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [team, setTeam] = useState<{ user_id: string; email: string }[]>([])
  const [events, setEvents] = useState<{ id: string; name: string; organization_name: string }[]>([])
  const [eventId, setEventId] = useState('')
  const [filter, setFilter] = useState('open')
  const [platform, setPlatform] = useState(false)
  const load = useCallback(async () => {
    setError('')
    try {
      const check = await supabase.rpc('is_support_operator')
      if (check.error) throw new Error(check.error.message)
      setAllowed(check.data === true); if (check.data !== true) return
      const admin = await supabase.rpc('is_platform_admin'); setPlatform(admin.data === true)
      const [workspace, operators] = await Promise.all([supabase.rpc('support_workspace'), supabase.rpc('support_team')])
      if (workspace.error || operators.error) throw new Error(workspace.error?.message ?? operators.error?.message)
      setTickets(workspace.data.tickets); setEvents(workspace.data.events); setTeam(operators.data ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); setAllowed(false) }
  }, [])
  useEffect(() => { if (session) void load() }, [session, load])
  async function update(e: React.FormEvent<HTMLFormElement>, ticket: Ticket) {
    e.preventDefault(); if (busy) return
    const f = new FormData(e.currentTarget); setBusy(true); setError('')
    try {
      const result = await supabase.rpc('support_update_ticket', { p_ticket: ticket.id, p_status: f.get('status'), p_assigned: f.get('assigned') || null, p_response: f.get('response') })
      if (result.error) throw new Error(result.error.message)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
    finally { setBusy(false) }
  }
  if (loading || (session && allowed === null)) return <p className="p-8">Comprobando acceso…</p>
  if (!session) return <Navigate to="/admin/login" replace />
  return <main className="min-h-screen bg-zinc-50 px-5 py-8"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-bold">Bandeja de soporte</h1><p className="mt-2 text-sm text-zinc-600">Tickets y preparación de eventos. La atención depende del horario acordado.</p></div><div className="flex gap-4 text-sm"><Link to="/" className="underline">Inicio</Link>{platform && <Link to="/superadmin" className="underline">Superadmin</Link>}<button onClick={() => void signOut()} className="underline">Cerrar sesión</button></div></header>
    {error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
    {!allowed ? <p className="mt-6">Tu cuenta no tiene permiso de soporte. Un superadmin debe habilitarlo.</p> : <>
      <div className="my-6 flex flex-wrap items-end gap-4"><label>Mostrar<select value={filter} onChange={e => setFilter(e.target.value)} className="ml-3 rounded-lg border p-2"><option value="open">Pendientes</option><option value="mine">Asignados a mí</option><option value="critical">Críticos pendientes</option><option value="resolved">Resueltos</option><option value="all">Todos</option></select></label><button disabled={busy} onClick={() => void load()} className="underline">Actualizar</button></div>
      <p className="mb-3 text-xs text-zinc-500">Hasta 100 tickets; pendientes y críticos aparecen primero.</p>
      {tickets.filter(t => filter === 'all' || (filter === 'mine' ? t.assigned_to === session.user.id : filter === 'critical' ? t.severity === 'critical' && t.status !== 'resolved' : filter === 'resolved' ? t.status === 'resolved' : t.status !== 'resolved')).map(t => <article key={t.id} className="mb-4 rounded-xl border bg-white p-5"><h2 className="font-bold">{t.title}</h2><p className="mt-1 text-xs text-zinc-500">{t.organization_name} · {t.event_name ?? 'Cuenta'} · {t.severity === 'critical' ? 'Crítica' : 'Normal'} · {new Date(t.updated_at).toLocaleString('es-VE')}</p><p className="my-3 whitespace-pre-wrap text-sm">{t.description}</p>{t.event_id && <button onClick={() => setEventId(t.event_id!)} className="mb-3 text-sm text-emerald-700 underline">Revisar preparación del evento</button>}
        <form onSubmit={e => void update(e, t)} className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Estado<select name="status" defaultValue={t.status} className="mt-1 w-full rounded-lg border p-2"><option value="open">Abierto</option><option value="in_progress">En atención</option><option value="resolved">Resuelto</option></select></label><label className="text-sm">Responsable<select name="assigned" defaultValue={t.assigned_to ?? ''} className="mt-1 w-full rounded-lg border p-2"><option value="">Sin asignar</option>{team.map(u => <option key={u.user_id} value={u.user_id}>{u.email}</option>)}</select></label><label className="text-sm sm:col-span-3">Respuesta o solución<textarea name="response" defaultValue={t.response_note ?? ''} maxLength={5000} className="mt-1 w-full rounded-lg border p-2" /></label><button disabled={busy} className="rounded-lg bg-zinc-900 p-2 text-sm text-white">Guardar atención</button></form><SupportConversation ticketId={t.id} onReply={load} />
      </article>)}
      <label className="mt-6 block font-semibold">Preparación de eventos<select value={eventId} onChange={e => setEventId(e.target.value)} className="mt-2 w-full rounded-lg border bg-white p-3 text-sm"><option value="">Selecciona un evento con preparación o ticket</option>{events.map(e => <option key={e.id} value={e.id}>{e.organization_name} · {e.name}</option>)}</select></label>
      {eventId && <EventPreparation key={eventId} eventId={eventId} support />}
    </>}
  </div></main>
}
