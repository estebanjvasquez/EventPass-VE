import { supabase } from './supabase'

// URL del Worker (aprovisionamiento del subdominio).
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

// Convierte un nombre en un slug DNS válido (minúsculas, guiones, sin acentos).
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// ¿Está libre el subdominio? (RPC callable por anon).
export async function slugAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('slug_available', { p_slug: slug })
  if (error) return false
  return data === true
}

// Activa el subdominio del tenant (mejor esfuerzo; reintentar desde el admin).
async function provisionSubdomain(orgId: string): Promise<void> {
  if (!API_URL) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${API_URL}/api/tenants/provision-domain`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ organization_id: orgId }),
    })
  } catch {
    /* la activación puede reintentarse desde Admin → Subdominio */
  }
}

function mapCreateError(msg: string): string {
  if (/no disponible|23505|duplicate/i.test(msg))
    return 'Ese subdominio ya no está disponible. Elígelo de nuevo en el panel.'
  if (/Ya perteneces/i.test(msg)) return 'Ya tienes una organización asociada.'
  if (/inválido/i.test(msg)) return 'El subdominio no es válido.'
  return msg
}

// Crea la organización a partir del metadata del usuario (guardado en el signUp)
// y activa su subdominio. Idempotente: si el usuario ya tiene organización, la
// reutiliza. Se ejecuta tras confirmar el correo (en /bienvenida).
export async function finishOnboarding(): Promise<{ orgId: string | null; error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { orgId: null, error: 'Sesión no encontrada. Inicia sesión de nuevo.' }

  // Idempotencia: si ya es miembro de una org, no la recreamos.
  const { data: existing } = await supabase
    .from('memberships')
    .select('organization_id')
    .limit(1)
    .maybeSingle()
  if (existing?.organization_id) {
    void provisionSubdomain(existing.organization_id as string)
    return { orgId: existing.organization_id as string, error: null }
  }

  const meta = user.user_metadata as { org_name?: string; org_slug?: string }
  if (!meta.org_name || !meta.org_slug) {
    return { orgId: null, error: 'No encontramos los datos de tu organización.' }
  }

  const { data: orgId, error } = await supabase.rpc('create_organization', {
    p_name: meta.org_name,
    p_slug: meta.org_slug,
  })
  if (error) return { orgId: null, error: mapCreateError(error.message) }

  void provisionSubdomain(orgId as string)
  return { orgId: orgId as string, error: null }
}
