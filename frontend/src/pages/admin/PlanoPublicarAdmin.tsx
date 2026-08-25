import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function PlanoPublicarAdmin() {
  const { eventId } = useParams<{ eventId: string }>(); const [mapId, setMapId] = useState(''); const [published, setPublished] = useState(false); const [message, setMessage] = useState('Cargando…')
  useEffect(() => { if (eventId) void supabase.from('venue_maps').select('id,published').eq('event_id', eventId).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data, error }) => { if (error) setMessage(error.message); else { setMapId(data?.id ?? ''); setPublished(Boolean(data?.published)); setMessage('') } }) }, [eventId])
  async function toggle() { if (!mapId) return; const { error } = await supabase.rpc('publish_floor_plan', { p_map_id: mapId, p_published: !published }); setMessage(error?.message ?? (!published ? 'Plano publicado.' : 'Plano retirado de publicación.')); if (!error) setPublished(!published) }
  return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl border bg-white p-6"><Link to={`/admin/stands/${eventId}`} className="inline-flex items-center gap-2 text-sm text-slate-600"><ArrowLeft className="h-4 w-4" />Volver al plano</Link><h1 className="mt-6 text-2xl font-bold">Publicación del plano</h1><p className="mt-2 text-sm text-slate-600">Al publicar, los asistentes podrán consultar el directorio, buscar stands y compartir el enlace QR.</p><button type="button" disabled={!mapId} onClick={() => void toggle()} className={`mt-6 rounded-lg px-4 py-3 text-sm font-semibold text-white ${published ? 'bg-slate-700' : 'bg-emerald-700'}`}>{published ? 'Retirar publicación' : 'Publicar plano'}</button>{published && <Link to={`/expo/${eventId}/plano`} target="_blank" className="ml-3 rounded-lg border px-4 py-3 text-sm font-semibold">Abrir vista pública</Link>}{message && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}</div></main>
}
