import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { ArrowLeft, Camera, Download, RefreshCw, ScanLine, Square } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { extractCredentialToken } from '../lib/credentialQr'

const READER_ID = 'exhibitor-visitor-reader'
type Stand = { element_id: string; label: string }
type Visitor = { visitor_key: string; profile_shared: boolean; visitor_name: string | null; visitor_company: string | null; visitor_job_title: string | null; visitor_email: string | null; first_visit: string; last_visit: string; visit_count: number }
type ScanResult = { result: 'recorded' | 'duplicate_ignored' | 'denied'; reason: string; profile_shared: boolean; visitor_name: string | null; visitor_company: string | null; visit_count: number }

export default function PortalExpositorVisitantes() {
  const { eventId } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const requestedCompanyId = params.get('companyId')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [eventName, setEventName] = useState('Evento')
  const [companyName, setCompanyName] = useState('Expositor')
  const [stands, setStands] = useState<Stand[]>([])
  const [standId, setStandId] = useState('')
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<ScanResult | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const processingRef = useRef(false)
  const backQuery = requestedCompanyId ? `?companyId=${encodeURIComponent(requestedCompanyId)}` : ''

  const loadVisitors = useCallback(async (resolvedCompany = companyId, resolvedStand = standId) => {
    if (!eventId || !resolvedCompany) return
    const { data, error } = await supabase.rpc('get_exhibitor_stand_visitors', { p_event_id: eventId, p_company_id: resolvedCompany, p_element_id: resolvedStand || null })
    if (error) setMessage(error.message)
    else setVisitors((data ?? []) as Visitor[])
  }, [companyId, eventId, standId])

  useEffect(() => {
    if (!eventId || !user?.id) return
    let alive = true
    async function load() {
      setLoading(true); setMessage(null)
      const { data: event } = await supabase.from('events').select('name').eq('id', eventId!).maybeSingle()
      if (!alive) return
      setEventName(event?.name ?? 'Evento')
      const { data: platformAdmin } = await supabase.rpc('is_platform_admin')
      let resolvedCompany = platformAdmin && requestedCompanyId ? requestedCompanyId : null
      if (!resolvedCompany) {
        const { data: membership, error } = await supabase.from('exhibitor_portal_members').select('company_id,company:companies(name)').eq('event_id', eventId!).eq('user_id', user!.id).eq('status', 'active').maybeSingle()
        if (error || !membership) { setMessage(error?.message ?? 'Tu usuario no tiene acceso a este expositor.'); setLoading(false); return }
        resolvedCompany = membership.company_id
        const company = membership.company as unknown as { name?: string } | null
        setCompanyName(company?.name ?? 'Expositor')
      } else {
        const { data: company } = await supabase.from('companies').select('name').eq('id', resolvedCompany).eq('event_id', eventId!).maybeSingle()
        setCompanyName(company?.name ?? 'Expositor')
      }
      setCompanyId(resolvedCompany)
      const { data, error } = await supabase.rpc('get_exhibitor_assigned_stands', { p_event_id: eventId!, p_company_id: resolvedCompany })
      if (error) setMessage(error.message)
      else {
        const assigned = (data ?? []) as Stand[]
        const first = assigned[0]?.element_id ?? ''
        setStands(assigned); setStandId(first)
        await loadVisitors(resolvedCompany, first)
      }
      setLoading(false)
    }
    void load()
    return () => { alive = false }
  }, [eventId, loadVisitors, requestedCompanyId, user?.id])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current; scannerRef.current = null
    if (scanner) { try { if (scanner.isScanning) await scanner.stop() } catch { /* detenido */ } try { scanner.clear() } catch { /* desmontado */ } }
    setScanning(false)
  }, [])
  useEffect(() => () => { void stopScanner() }, [stopScanner])

  const registerVisit = useCallback(async (rawToken: string) => {
    const credentialToken = extractCredentialToken(rawToken)
    if (!eventId || !companyId || !standId || processingRef.current || !credentialToken) return
    processingRef.current = true; setProcessing(true); setMessage(null)
    const { data, error } = await supabase.rpc('scan_exhibitor_stand_badge', { p_event_id: eventId, p_company_id: companyId, p_element_id: standId, p_credential_token: credentialToken, p_device_label: navigator.userAgent.slice(0, 150) })
    if (error) { setMessage(error.message); setLastScan(null) }
    else {
      const result = ((data ?? []) as ScanResult[])[0] ?? null
      setLastScan(result)
      if (result?.result === 'denied') setMessage(result.reason)
      else await loadVisitors(companyId, standId)
    }
    setToken('')
    window.setTimeout(() => { processingRef.current = false; setProcessing(false) }, 1200)
  }, [companyId, eventId, loadVisitors, standId])

  async function startScanner() {
    setMessage(null)
    const scanner = new Html5Qrcode(READER_ID); scannerRef.current = scanner
    try {
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (value) => { void registerVisit(value) }, () => undefined)
      setScanning(true)
    } catch (error) { scannerRef.current = null; setMessage(error instanceof Error ? error.message : 'No se pudo abrir la cámara.'); try { scanner.clear() } catch { /* sin iniciar */ } }
  }

  const totalVisits = useMemo(() => visitors.reduce((sum, row) => sum + Number(row.visit_count), 0), [visitors])
  const repeats = useMemo(() => visitors.filter((row) => Number(row.visit_count) > 1).length, [visitors])
  function exportCsv() {
    const rows = [['Visitante','Empresa','Cargo','Correo','Primera visita','Última visita','Visitas'], ...visitors.map((row) => [row.visitor_name ?? '',row.visitor_company ?? '',row.visitor_job_title ?? '',row.visitor_email ?? '',new Date(row.first_visit).toLocaleString('es-VE'),new Date(row.last_visit).toLocaleString('es-VE'),String(row.visit_count)])]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"','""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'visitantes-stand.csv'; link.click(); URL.revokeObjectURL(url)
  }

  return <main className="min-h-[100dvh] bg-zinc-50 px-4 py-6"><div className="mx-auto max-w-6xl">
    <Link to={`/portal/expositor/${eventId}${backQuery}`} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700"><ArrowLeft className="h-4 w-4" />Volver al portal</Link>
    <header className="mt-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">{companyName}</p><h1 className="text-2xl font-bold">Visitantes del stand</h1><p className="text-sm text-zinc-600">{eventName} · Escanea la credencial de cada visitante.</p></div><button type="button" disabled={!visitors.length} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40"><Download className="h-4 w-4" />Descargar CSV</button></header>
    {message && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
    {loading ? <p className="mt-8 text-sm text-zinc-500">Cargando…</p> : !stands.length ? <section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="font-bold">Aún no tienes un stand asignado</h2><p className="text-sm text-zinc-600">El organizador debe asignar un espacio antes de escanear.</p></section> : <>
      <section className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Visitantes únicos" value={visitors.length}/><Metric label="Visitas registradas" value={totalVisits}/><Metric label="Visitantes que regresaron" value={repeats}/></section>
      <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]"><section className="rounded-2xl border bg-white p-5"><label className="text-sm font-semibold">Stand activo<select value={standId} onChange={(e) => { void stopScanner(); setStandId(e.target.value); void loadVisitors(companyId,e.target.value) }} className="mt-2 w-full rounded-lg border px-3 py-2.5 font-normal">{stands.map((stand) => <option key={stand.element_id} value={stand.element_id}>{stand.label || 'Stand sin número'}</option>)}</select></label><div id={READER_ID} className="mt-4 overflow-hidden rounded-xl bg-zinc-950"/><button type="button" onClick={() => scanning ? void stopScanner() : void startScanner()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">{scanning ? <><Square className="h-4 w-4"/>Detener cámara</> : <><Camera className="h-4 w-4"/>Abrir cámara y escanear</>}</button><form className="mt-4 border-t pt-4" onSubmit={(e) => { e.preventDefault(); void registerVisit(token) }}><label className="text-xs font-semibold uppercase text-zinc-500">Lector USB o prueba manual<input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Contenido del QR" className="mt-2 w-full rounded-lg border px-3 py-2.5 text-sm font-normal normal-case"/></label><button disabled={!token.trim() || processing} className="mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"><ScanLine className="h-4 w-4"/>Registrar visita</button></form>{processing && <p className="mt-4 flex items-center gap-2 text-sm text-violet-700"><RefreshCw className="h-4 w-4 animate-spin"/>Validando credencial…</p>}{lastScan && <div className={`mt-4 rounded-xl border p-4 text-sm ${lastScan.result === 'recorded' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><b>{lastScan.reason}</b>{lastScan.visitor_name && <p>{lastScan.visitor_name}{lastScan.visitor_company ? ` · ${lastScan.visitor_company}` : ''}</p>}<p className="text-xs">Visitas: {lastScan.visit_count}</p></div>}</section>
      <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><div><h2 className="font-bold">Listado de visitantes</h2><p className="text-xs text-zinc-500">Cada lectura válida conserva la visita, incluyendo repeticiones.</p></div><button type="button" onClick={() => void loadVisitors()} className="h-fit rounded-lg border p-2"><RefreshCw className="h-4 w-4"/></button></div>{!visitors.length ? <p className="mt-8 text-center text-sm text-zinc-500">Todavía no hay visitas.</p> : <div className="mt-4 divide-y">{visitors.map((row) => <article key={row.visitor_key} className="py-4"><div className="flex justify-between gap-3"><div><h3 className="font-semibold">{row.visitor_name || 'Visitante'}</h3><p className="text-sm text-zinc-600">{[row.visitor_job_title,row.visitor_company].filter(Boolean).join(' · ') || 'Datos profesionales no indicados'}</p>{row.visitor_email && <p className="text-xs text-zinc-500">{row.visitor_email}</p>}</div><b className="h-fit rounded-full bg-zinc-100 px-2.5 py-1 text-xs">{row.visit_count} visita{Number(row.visit_count) === 1 ? '' : 's'}</b></div><p className="mt-2 text-xs text-zinc-400">Primera: {new Date(row.first_visit).toLocaleString('es-VE')} · Última: {new Date(row.last_visit).toLocaleString('es-VE')}</p></article>)}</div>}</section></div>
    </>}
  </div></main>
}
function Metric({label,value}:{label:string;value:number}) { return <div className="rounded-xl border bg-white p-4"><span className="text-xs font-semibold uppercase text-zinc-500">{label}</span><b className="mt-1 block text-3xl">{value}</b></div> }
