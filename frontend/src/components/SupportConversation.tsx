import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Message = { id: string; body: string; from_support: boolean; created_at: string }
export default function SupportConversation({ ticketId, onReply }: { ticketId: string; onReply?: () => Promise<void> }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const result = await supabase.from('support_ticket_messages').select('id,body,from_support,created_at').eq('ticket_id', ticketId).order('created_at')
    if (result.error) setError(result.error.message); else setMessages(result.data ?? [])
  }, [ticketId])
  useEffect(() => { void load() }, [load])
  async function reply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return
    const form = e.currentTarget; const body = String(new FormData(form).get('body') ?? '')
    setBusy(true); setError('')
    try { const result = await supabase.rpc('support_reply', { p_ticket: ticketId, p_body: body }); if (result.error) throw new Error(result.error.message); form.reset(); await load(); await onReply?.() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo responder') }
    finally { setBusy(false) }
  }
  return <details className="mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold" onClick={() => void load()}>Conversación y seguimiento ({messages.length})</summary>{error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}{messages.map(m => <div key={m.id} className={`my-3 rounded-lg p-3 ${m.from_support ? 'bg-sky-50' : 'bg-zinc-50'}`}><p className="text-xs text-zinc-500">{m.from_support ? 'Soporte' : 'Organización'} · {new Date(m.created_at).toLocaleString('es-VE')}</p><p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p></div>)}<form onSubmit={reply} className="mt-3 space-y-2"><label className="block text-sm">Añadir mensaje<textarea required name="body" minLength={2} maxLength={5000} className="mt-1 w-full rounded-lg border p-2 text-sm" placeholder="Sin contraseñas ni datos sensibles." /></label><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white">Enviar mensaje</button><p className="text-xs text-zinc-500">Un mensaje del cliente reabre un ticket resuelto.</p></form></details>
}
