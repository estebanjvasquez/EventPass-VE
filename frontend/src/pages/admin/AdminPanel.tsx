import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCog, Check, FileText, LogOut, MapPin, RefreshCw, ScanLine, Ticket, X } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

type SeatInfo = { seat_number: string | null; row_label: string | null; column_number: number | null }

type Registration = {
  id: string
  first_name: string
  last_name: string | null
  email: string
  phone: string | null
  status: 'pending_payment' | 'payment_submitted' | 'confirmed' | 'rejected'
  comprobante_path: string | null
  payment_method: string | null
  payment_amount: number | null
  seat_id: string | null
  seats: SeatInfo | SeatInfo[] | null
  created_at: string
}

type EventOption = { id: string; name: string }

function seatLabel(seats: Registration['seats']): string | null {
  if (!seats) return null
  const s = Array.isArray(seats) ? seats[0] : seats
  if (!s) return null
  return s.seat_number ?? ([s.row_label, s.column_number].filter((x) => x != null).join('') || null)
}

type Membership = {
  organization_id: string
  role: string
  organizations: { name: string | null } | null
}

const STATUS_LABEL: Record<Registration['status'], string> = {
  pending_payment: 'Pendiente de pago',
  payment_submitted: 'Comprobante enviado',
  confirmed: 'Confirmado',
  rejected: 'Rechazado',
}

const STATUS_STYLE: Record<Registration['status'], string> = {
  pending_payment: 'bg-zinc-100 text-zinc-600',
  payment_submitted: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

type Tab = 'por_revisar' | 'confirmed' | 'rejected'

export default function AdminPanel() {
  const { user, signOut } = useAuth()
  const [membership, setMembership] = useState<Membership | null>(null)
  const [rows, setRows] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('por_revisar')
  const [actingId, setActingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [events, setEvents] = useState<EventOption[]>([])
  const [eventFilter, setEventFilter] = useState<string>('all')

  const loadRegistrations = useCallback(async (orgId: string, eventId: string = 'all') => {
    let query = supabase
      .from('registrations')
      .select(
        'id, first_name, last_name, email, phone, status, comprobante_path, payment_method, payment_amount, seat_id, seats(seat_number, row_label, column_number), created_at',
      )
      .eq('organization_id', orgId)
    if (eventId !== 'all') query = query.eq('event_id', eventId)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRows((data ?? []) as Registration[])
  }, [])

  useEffect(() => {
    let active = true
    async function init() {
      setLoading(true)
      setError(null)
      const { data: mem, error: memErr } = await supabase
        .from('memberships')
        .select('organization_id, role, organizations(name)')
        .limit(1)
        .maybeSingle()
      if (!active) return
      if (memErr) {
        setError(memErr.message)
        setLoading(false)
        return
      }
      const m = mem as Membership | null
      setMembership(m)
      if (m) {
        const { data: evs } = await supabase
          .from('events')
          .select('id, name')
          .eq('organization_id', m.organization_id)
          .order('created_at', { ascending: false })
        if (active) setEvents((evs ?? []) as EventOption[])
        await loadRegistrations(m.organization_id)
      }
      if (active) setLoading(false)
    }
    init()
    return () => {
      active = false
    }
  }, [loadRegistrations])

  function onFilterChange(eventId: string) {
    setEventFilter(eventId)
    if (membership) void loadRegistrations(membership.organization_id, eventId)
  }

  async function viewComprobante(row: Registration) {
    if (!row.comprobante_path) return
    setViewingId(row.id)
    setError(null)
    const { data, error } = await supabase.storage
      .from('comprobantes')
      .createSignedUrl(row.comprobante_path, 60)
    setViewingId(null)
    if (error || !data) {
      setError(error?.message ?? 'No se pudo abrir el comprobante.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function act(row: Registration, status: 'confirmed' | 'rejected') {
    if (!membership) return
    let rejection_reason: string | null = null
    if (status === 'rejected') {
      rejection_reason = window.prompt('Motivo del rechazo (opcional):') ?? null
    }
    setActingId(row.id)
    const patch: Record<string, unknown> = { status }
    if (status === 'confirmed') patch.payment_confirmed_at = new Date().toISOString()
    if (status === 'rejected') {
      patch.rejection_reason = rejection_reason
      patch.seat_id = null // al rechazar, se suelta el asiento
    }
    const { error } = await supabase.from('registrations').update(patch).eq('id', row.id)
    if (error) {
      setError(error.message)
      setActingId(null)
      return
    }

    // Refleja el estado del asiento reservado.
    if (row.seat_id) {
      await supabase
        .from('seats')
        .update({ status: status === 'confirmed' ? 'confirmed' : 'available' })
        .eq('id', row.seat_id)
    }

    // Al confirmar, dispara el correo con el enlace a la credencial (Worker).
    // Best-effort: un fallo de correo no revierte la confirmación.
    const apiUrl = import.meta.env.VITE_API_URL
    if (status === 'confirmed' && apiUrl) {
      try {
        await fetch(`${apiUrl}/api/registrations/confirm-notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registration_id: row.id }),
        })
      } catch {
        // Silencioso: el registro ya quedó confirmado.
      }
    }

    await loadRegistrations(membership.organization_id, eventFilter)
    setActingId(null)
  }

  const counts = useMemo(() => {
    return {
      por_revisar: rows.filter(
        (r) => r.status === 'pending_payment' || r.status === 'payment_submitted',
      ).length,
      confirmed: rows.filter((r) => r.status === 'confirmed').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    }
  }, [rows])

  const visible = useMemo(() => {
    if (tab === 'por_revisar') {
      return rows.filter(
        (r) => r.status === 'pending_payment' || r.status === 'payment_submitted',
      )
    }
    return rows.filter((r) => r.status === tab)
  }, [rows, tab])

  return (
    <div className="min-h-[100dvh] bg-[#fafafa]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-900 text-emerald-400">
              <Ticket className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {membership?.organizations?.name ?? 'EventPass VE'}
              </p>
              <p className="text-xs text-zinc-500">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/eventos"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
            >
              <CalendarCog className="h-4 w-4" />
              Eventos
            </Link>
            <Link
              to="/admin/checkin"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white transition-transform active:scale-[0.98]"
            >
              <ScanLine className="h-4 w-4" />
              Check-in
            </Link>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Registros</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Verifica los comprobantes y confirma o rechaza las inscripciones.
            </p>
          </div>
          {membership && (
            <div className="flex items-center gap-2">
              <select
                aria-label="Filtrar por evento"
                value={eventFilter}
                onChange={(e) => onFilterChange(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition-colors focus:border-emerald-500"
              >
                <option value="all">Todos los eventos</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadRegistrations(membership.organization_id, eventFilter)}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
              >
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && !membership && !error && (
          <p className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Tu usuario no está asociado a ninguna organización. Pide a un administrador que te agregue.
          </p>
        )}

        {membership && (
          <>
            <div className="mt-8 flex gap-1 border-b border-zinc-200">
              {([
                ['por_revisar', 'Por revisar', counts.por_revisar],
                ['confirmed', 'Confirmados', counts.confirmed],
                ['rejected', 'Rechazados', counts.rejected],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === key
                      ? 'border-emerald-600 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {label} <span className="text-zinc-400">({count})</span>
                </button>
              ))}
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {loading ? (
                <div className="divide-y divide-zinc-100">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse bg-white px-5" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <p className="px-5 py-12 text-center text-sm text-zinc-500">
                  No hay registros en esta sección.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase tracking-wider text-zinc-400">
                      <th className="px-5 py-3 font-medium">Asistente</th>
                      <th className="px-5 py-3 font-medium">Contacto</th>
                      <th className="px-5 py-3 font-medium">Asiento</th>
                      <th className="px-5 py-3 font-medium">Estado</th>
                      <th className="px-5 py-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {visible.map((r) => (
                      <tr key={r.id} className="transition-colors hover:bg-zinc-50">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-zinc-900">
                            {r.first_name} {r.last_name ?? ''}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {new Date(r.created_at).toLocaleDateString('es-VE')}
                          </p>
                        </td>
                        <td className="px-5 py-3.5 text-zinc-600">
                          <p>{r.email}</p>
                          <p className="text-xs text-zinc-500">{r.phone}</p>
                        </td>
                        <td className="px-5 py-3.5 text-zinc-600">
                          {seatLabel(r.seats) ? (
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-800">
                              <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                              {seatLabel(r.seats)}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-2">
                            {r.comprobante_path && (
                              <button
                                disabled={viewingId === r.id}
                                onClick={() => viewComprobante(r)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {viewingId === r.id ? 'Abriendo…' : 'Comprobante'}
                              </button>
                            )}
                            {r.status !== 'confirmed' && (
                              <button
                                disabled={actingId === r.id}
                                onClick={() => act(r, 'confirmed')}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Confirmar
                              </button>
                            )}
                            {r.status !== 'rejected' && (
                              <button
                                disabled={actingId === r.id}
                                onClick={() => act(r, 'rejected')}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Rechazar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
