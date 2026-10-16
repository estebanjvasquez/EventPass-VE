import { supabase } from './supabase'
import { setAdminMode } from './adminNavigation'

// La organización sobre la que operan las páginas admin. Normalmente es la del
// usuario (su membresía); si un superadmin eligió "gestionar como cliente", se
// guarda ese org_id en sessionStorage y las páginas operan sobre él.
const KEY = 'impersonate_org'
const ACTIVE_KEY = 'admin_active_org'
export function setActiveOrg(orgId:string){sessionStorage.setItem(ACTIVE_KEY,orgId)}

export function setImpersonatedOrg(orgId: string | null) {
  if (orgId) { sessionStorage.setItem(KEY, orgId); setAdminMode('organization') }
  else sessionStorage.removeItem(KEY)
}
export function getImpersonatedOrg(): string | null {
  return sessionStorage.getItem(KEY)
}
export function clearImpersonation() {
  setAdminMode('platform')
}

export type ActiveOrg = {
  organization_id: string
  role: string
  organizations: { name: string | null } | null
  impersonating: boolean
}

// Resuelve la organización activa. Si hay impersonación y el usuario es
// superadmin, usa esa; si no, la de su membresía.
export async function resolveActiveOrg(): Promise<ActiveOrg | null> {
  const imp = getImpersonatedOrg()
  if (imp) {
    const { data: isAdmin } = await supabase.rpc('is_platform_admin')
    if (isAdmin === true) {
      const { data } = await supabase.from('organizations').select('name').eq('id', imp).maybeSingle()
      if (data) {
        return {
          organization_id: imp,
          role: 'owner',
          organizations: { name: (data as { name: string | null }).name },
          impersonating: true,
        }
      }
    }
    setImpersonatedOrg(null) // no autorizado o no encontrado: descartar
  }

  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return null
  const selected=sessionStorage.getItem(ACTIVE_KEY)
  let query = supabase
    .from('memberships')
    .select('organization_id, role, organizations(name)')
    .eq('user_id',user.id)
  if(selected)query=query.eq('organization_id',selected)
  const { data: mem } = await query
    .order('created_at',{ascending:true})
    .limit(1)
    .maybeSingle()
  if (!mem) {
    if(selected){sessionStorage.removeItem(ACTIVE_KEY);return resolveActiveOrg()}
    return null
  }
  const m = mem as {
    organization_id: string
    role: string
    organizations: { name: string | null } | { name: string | null }[] | null
  }
  const orgs = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations
  return { organization_id: m.organization_id, role: m.role, organizations: orgs ?? null, impersonating: false }
}
