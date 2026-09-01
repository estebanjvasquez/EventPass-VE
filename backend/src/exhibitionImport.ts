import { z } from 'zod'

export const detectedKindSchema = z.enum([
  'stand', 'aisle', 'access', 'emergency_exit', 'stage', 'restroom',
  'service', 'wall', 'column', 'information',
])

export const exhibitionDetectionSchema = z.object({
  summary: z.string().max(500),
  elements: z.array(z.object({
    source_id: z.string().min(1).max(40),
    kind: detectedKindSchema,
    label: z.string().max(120),
    x: z.number().int().min(0).max(1000),
    y: z.number().int().min(0).max(1000),
    width: z.number().int().min(1).max(1000),
    height: z.number().int().min(1).max(1000),
    confidence: z.number().min(0).max(1),
  }).strict()).max(250),
  warnings: z.array(z.string().max(240)).max(30),
}).strict()

export const exhibitionDetectionJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    elements: {
      type: 'array', maxItems: 250,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          source_id: { type: 'string' },
          kind: { type: 'string', enum: detectedKindSchema.options },
          label: { type: 'string' },
          x: { type: 'integer', minimum: 0, maximum: 1000 },
          y: { type: 'integer', minimum: 0, maximum: 1000 },
          width: { type: 'integer', minimum: 1, maximum: 1000 },
          height: { type: 'integer', minimum: 1, maximum: 1000 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['source_id', 'kind', 'label', 'x', 'y', 'width', 'height', 'confidence'],
      },
    },
    warnings: { type: 'array', items: { type: 'string' }, maxItems: 30 },
  },
  required: ['summary', 'elements', 'warnings'],
} as const

export type ExhibitionProposalElement = {
  source_id: string
  kind: z.infer<typeof detectedKindSchema>
  label: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  conflicts: string[]
  needs_review: boolean
}

function snap(value: number) { return Math.round(value * 4) / 4 }
function overlaps(a: ExhibitionProposalElement, b: ExhibitionProposalElement) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function normalizeExhibitionDetection(
  detection: z.infer<typeof exhibitionDetectionSchema>,
  mapWidth: number,
  mapHeight: number,
) {
  const warnings = [...detection.warnings]
  const used = new Set<string>()
  const discardedAggregates: string[] = []
  const individualDetections = detection.elements.filter((raw) => {
    const aggregateLabel = /\b(grupo|agrupaci[oó]n|fila|franja|[aá]rea)\b.*\bstand|\bstands?\b.*\b(varios|m[uú]ltiples|centrales|superiores)\b/i.test(raw.label)
    const oversizedStand = raw.kind === 'stand' && raw.width > 250 && raw.height > 250
    if (raw.kind === 'stand' && (aggregateLabel || oversizedStand)) {
      discardedAggregates.push(raw.label)
      return false
    }
    return true
  })
  if (discardedAggregates.length) warnings.push(`${discardedAggregates.length} agrupaciones de stands se descartaron: la IA debe detectar cada stand individualmente.`)
  const elements: ExhibitionProposalElement[] = individualDetections.map((raw, index) => {
    let sourceId = raw.source_id.trim() || `element-${index + 1}`
    while (used.has(sourceId)) sourceId = `${sourceId}-${index + 1}`
    used.add(sourceId)
    const x = snap(Math.min(mapWidth - 0.25, Math.max(0, raw.x / 1000 * mapWidth)))
    const y = snap(Math.min(mapHeight - 0.25, Math.max(0, raw.y / 1000 * mapHeight)))
    const width = snap(Math.max(0.25, Math.min(mapWidth - x, raw.width / 1000 * mapWidth)))
    const height = snap(Math.max(0.25, Math.min(mapHeight - y, raw.height / 1000 * mapHeight)))
    return { ...raw, source_id: sourceId, label: raw.label.trim() || `Elemento ${index + 1}`, x, y, width, height, conflicts: [], needs_review: raw.confidence < 0.7 }
  })
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      // Pasillos y accesos pueden atravesar zonas arquitectónicas; dos stands no.
      if (elements[i].kind === 'stand' && elements[j].kind === 'stand' && overlaps(elements[i], elements[j])) {
        elements[i].conflicts.push(elements[j].source_id)
        elements[j].conflicts.push(elements[i].source_id)
        elements[i].needs_review = true
        elements[j].needs_review = true
      }
    }
  }
  const conflictCount = elements.filter(item => item.conflicts.length > 0).length
  if (conflictCount) warnings.push(`${conflictCount} stands se superponen y requieren revisión antes de aplicar.`)
  if (!elements.length) warnings.push('No se detectaron elementos utilizables en el archivo.')
  return { summary: detection.summary, elements, warnings }
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}
