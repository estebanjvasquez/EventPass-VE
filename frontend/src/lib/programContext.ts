import { supabase } from './supabase'

export type ProgramScope = { id: string; name: string; eventIds: string[] }

/**
 * Devuelve únicamente programas de la organización que realmente agrupan dos
 * o más eventos. Así, un evento aislado nunca obtiene datos de otro por error.
 */
export async function loadProgramScopes(organizationId: string, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, ProgramScope[]>()
  const membership = await supabase.from('program_events').select('program_id,event_id').in('event_id', eventIds)
  if (membership.error || !membership.data?.length) return new Map<string, ProgramScope[]>()
  const programIds = [...new Set(membership.data.map(item => item.program_id))]
  const [programsResult, allLinksResult] = await Promise.all([
    supabase.from('event_programs').select('id,name').eq('organization_id', organizationId).in('id', programIds),
    supabase.from('program_events').select('program_id,event_id').in('program_id', programIds),
  ])
  if (programsResult.error || allLinksResult.error) return new Map<string, ProgramScope[]>()
  const linksByProgram = new Map<string, string[]>()
  for (const link of allLinksResult.data ?? []) {
    const linkedEvents = linksByProgram.get(link.program_id) ?? []
    linkedEvents.push(link.event_id)
    linksByProgram.set(link.program_id, linkedEvents)
  }
  const valid = new Map((programsResult.data ?? []).flatMap(program => {
    const linked = [...new Set(linksByProgram.get(program.id) ?? [])]
    return linked.length > 1 ? [[program.id, { id: program.id, name: program.name, eventIds: linked } satisfies ProgramScope] as const] : []
  }))
  const result = new Map<string, ProgramScope[]>()
  for (const link of membership.data) {
    const scope = valid.get(link.program_id)
    if (!scope) continue
    const eventScopes = result.get(link.event_id) ?? []
    eventScopes.push(scope)
    result.set(link.event_id, eventScopes)
  }
  return result
}
