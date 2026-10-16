import { useMemo, useState } from 'react'
export default function SocialMembersImport({ households, busy, save }: { households: { id: string; name: string }[]; busy: boolean; save: (data: Record<string, unknown>) => Promise<boolean> }) {
  const [source, setSource] = useState('')
  const [household, setHousehold] = useState('')
  const [approved, setApproved] = useState(false)
  const rows = useMemo(() => source.split(/\r?\n/).filter(x => x.trim()).map(line => { const [first_name = '', last_name = '', email = ''] = line.split('\t').map(x => x.trim()); return { first_name, last_name, email } }), [source])
  const invalid = rows.some(r => r.first_name.length < 2 || (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)))
  const duplicates = rows.length !== new Set(rows.map(r => `${r.first_name.toLocaleLowerCase()}|${r.last_name.toLocaleLowerCase()}`)).size
  return <section className="space-y-3 rounded border bg-white p-4"><h3 className="font-semibold">Importar integrantes con vista previa</h3><p className="text-sm">Copia desde una hoja de cálculo tres columnas sin encabezado: nombre, apellido y correo opcional, separadas por tabulaciones. Hasta 200 personas por lote; se agregan al hogar seleccionado sin fusionar identidades.</p><label className="block text-sm">Hogar<select className="block w-full rounded border p-2" value={household} onChange={e => setHousehold(e.target.value)}><option value="">Seleccionar…</option>{households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label className="block text-sm">Integrantes<textarea className="block min-h-24 w-full rounded border p-2 font-mono" value={source} onChange={e => { setSource(e.target.value); setApproved(false) }} /></label>
    <p>{rows.length} personas detectadas.{invalid ? ' Revisa nombres y correos.' : ''}{duplicates ? ' Hay nombres repetidos: comprueba si son personas distintas.' : ''}</p>
    <ul className="max-h-40 overflow-auto text-sm">{rows.slice(0, 200).map((r, n) => <li key={n}>{n + 1}. {r.first_name} {r.last_name} · {r.email || 'Sin correo individual'}</li>)}</ul>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />Revisé la lista y sus posibles duplicados.</label><button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-50" disabled={busy || !household || !approved || invalid || rows.length < 1 || rows.length > 200} onClick={async () => { if (await save({ household_id: household, rows })) { setSource(''); setApproved(false) } }}>Importar lote completo</button>
  </section>
}
