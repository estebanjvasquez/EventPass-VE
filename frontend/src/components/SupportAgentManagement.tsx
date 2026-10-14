import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function SupportAgentManagement() {
  const [users, setUsers] = useState<{ user_id: string; email: string; suspended: boolean }[]>([])
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [u, a] = await Promise.all([supabase.rpc('admin_users'), supabase.from('platform_support_agents').select('user_id,enabled')])
    if (u.error || a.error) setError(u.error?.message ?? a.error?.message ?? 'Error de carga')
    else { setUsers(u.data ?? []); setEnabled(new Set((a.data ?? []).filter(x => x.enabled).map(x => x.user_id))) }
  }, [])
  useEffect(() => { void load() }, [load])
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return
    const f = new FormData(e.currentTarget); setBusy(true); setError('')
    try { const result = await supabase.rpc('admin_set_support_agent', { p_user: f.get('user'), p_enabled: f.get('enabled') === 'on' }); if (result.error) throw new Error(result.error.message); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
    finally { setBusy(false) }
  }
  return <section className="mt-5 rounded-xl border bg-white p-5"><h2 className="text-xl font-bold">Equipo de soporte</h2><p className="my-2 text-sm">Habilita una cuenta existente para atender tickets y registrar preparación entre organizaciones. No otorga permisos financieros ni acceso a participantes. Una cuenta suspendida no puede atender.</p><Link to="/soporte" className="text-sm text-emerald-700 underline">Abrir bandeja de soporte</Link>{error && <p role="alert" className="my-3 text-red-700">{error}</p>}<form onSubmit={save} className="mt-4 flex flex-wrap items-center gap-3"><label>Cuenta<select required name="user" className="ml-2 rounded-lg border p-2"><option value="">Seleccionar</option>{users.map(u => <option key={u.user_id} value={u.user_id}>{u.email}{enabled.has(u.user_id) ? ' · soporte habilitado' : ''}{u.suspended ? ' · suspendida' : ''}</option>)}</select></label><label><input name="enabled" type="checkbox" defaultChecked /> Habilitar soporte</label><button disabled={busy} className="rounded-lg bg-zinc-900 px-4 py-2 text-white">Aplicar permiso</button></form><p className="mt-2 text-xs text-zinc-500">Para revocar, selecciona la cuenta y desmarca «Habilitar soporte». La revocación se comprueba en cada operación.</p></section>
}
