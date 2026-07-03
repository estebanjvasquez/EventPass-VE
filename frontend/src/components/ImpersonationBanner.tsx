import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { clearImpersonation, getImpersonatedOrg } from '../lib/activeOrg'

// Barra visible solo cuando un superadmin está gestionando como un cliente.
export default function ImpersonationBanner() {
  const navigate = useNavigate()
  const orgId = getImpersonatedOrg()
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => setName((data as { name: string } | null)?.name ?? 'cliente'))
  }, [orgId])

  if (!orgId) return null

  return (
    <div className="bg-amber-500 text-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Gestionando como <strong>{name ?? '…'}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            clearImpersonation()
            navigate('/superadmin')
          }}
          className="rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold transition-colors hover:bg-white/30"
        >
          Volver a superadmin
        </button>
      </div>
    </div>
  )
}
