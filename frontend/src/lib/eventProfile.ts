export const eventSubtypes: Record<string, [string, string][]> = {
  forum: [['forum', 'Foro'], ['conference', 'Congreso / conferencia'], ['product_launch', 'Presentación de producto'], ['networking', 'Encuentro corporativo']],
  exhibition: [['exhibition', 'Exposición / feria']],
  workshop: [['workshop', 'Taller / capacitación']],
  social: [['social', 'Encuentro social'], ['wedding', 'Boda'], ['celebration', 'Fiesta / aniversario'], ['graduation', 'Graduación'], ['gala', 'Gala / recepción']],
}
export const eventPurposes: [string, string][] = [['commercial', 'Comercial / profesional'], ['private', 'Celebración privada'], ['fundraising', 'Benéfico / recaudación'], ['institutional', 'Institucional / académico']]
export function eventProfile(event: { event_type: string; config?: Record<string, unknown> | null }) {
  const config = event.config ?? {}
  const subtypes = eventSubtypes[event.event_type] ?? []
  const subtype = subtypes.find(([key]) => key === config.event_subtype) ?? subtypes[0]
  return {
    subtype: subtype?.[0] ?? event.event_type,
    label: subtype?.[1] ?? event.event_type,
    purpose: String(config.event_purpose ?? (event.event_type === 'social' ? 'private' : 'commercial')),
    guests: typeof config.guest_management === 'boolean' ? config.guest_management : event.event_type === 'social',
    social: event.event_type === 'social',
  }
}
