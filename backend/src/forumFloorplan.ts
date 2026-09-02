import { z } from 'zod'

export const forumLayoutIntentSchema = z.object({
  capacity: z.number().int().min(1).max(5000),
  central_aisle: z.boolean(),
  front_cross_aisle: z.boolean(),
  rear_cross_aisle: z.boolean(),
  side_aisles: z.enum(['none', 'left', 'right', 'both']),
  entrances: z.enum(['none', 'left', 'right', 'both_sides', 'rear_pair']),
  interpretation: z.string().trim().min(1).max(240),
}).strict()

export type ForumLayoutIntent = z.infer<typeof forumLayoutIntentSchema>

const numberWords: Record<string, number> = {
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

function normalized(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Mantiene la creación disponible si el modelo devuelve una respuesta fuera del
 * esquema, pero el texto contiene un montaje inequívoco. Las reservas se
 * aplican después con las categorías ya configuradas en el evento.
 */
export function inferForumLayoutIntent(prompt: string): ForumLayoutIntent | null {
  const text = normalized(prompt)
  const capacityMatch = text.match(/(?:para|aforo(?:\s+de)?|capacidad(?:\s+de)?|con)\s+(\d{1,4}|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:personas|asistentes|sillas|cupos)/)
    ?? text.match(/(\d{1,4})\s+(?:personas|asistentes|sillas|cupos)/)
  if (!capacityMatch) return null
  const rawCapacity = capacityMatch[1]
  const capacity = /^\d+$/.test(rawCapacity) ? Number(rawCapacity) : numberWords[rawCapacity]
  if (!capacity || capacity < 1 || capacity > 5000) return null

  const central_aisle = /pasillo\s+central|central\s+vertical/.test(text)
  const front_cross_aisle = /pasillo\s+(?:delante|frontal)|(?:delante|frontal).*pasillo/.test(text)
  const rear_cross_aisle = /pasillo\s+(?:detras|posterior)|(?:detras|posterior).*pasillo/.test(text)
  const side_aisles: ForumLayoutIntent['side_aisles'] = /pasillos?\s+laterales|laterales.*pasillos?/.test(text) ? 'both' : 'none'
  const entrances: ForumLayoutIntent['entrances'] = /entradas?\s+laterales|laterales.*entradas?/.test(text)
    ? 'both_sides'
    : /entradas?\s+(?:posteriores|traseras)|(?:posteriores|traseras).*entradas?/.test(text)
      ? 'rear_pair'
      : 'none'
  return {
    capacity,
    central_aisle,
    front_cross_aisle,
    rear_cross_aisle,
    side_aisles,
    entrances,
    interpretation: `Plano para ${capacity} personas con ${central_aisle ? 'pasillo central' : 'circulación lateral'}${front_cross_aisle ? ', pasillo frontal' : ''}${rear_cross_aisle ? ', pasillo posterior' : ''}.`,
  }
}

const forumRectSchema = z.object({
  x: z.number().int().min(0).max(99),
  y: z.number().int().min(0).max(99),
  width: z.number().int().min(1).max(100),
  height: z.number().int().min(1).max(100),
  label: z.string().trim().min(1).max(60),
})

export const forumPlanSchema = z.object({
  summary: z.string().trim().min(1).max(300),
  columns: z.number().int().min(6).max(100),
  rows: z.number().int().min(6).max(100),
  capacity: z.number().int().min(1).max(5000),
  stage: forumRectSchema,
  aisles: z.array(forumRectSchema.extend({ axis: z.enum(['horizontal', 'vertical']) })).max(12),
  entrances: z.array(forumRectSchema).max(12),
  seating_blocks: z.array(z.object({
    x: z.number().int().min(0).max(99),
    y: z.number().int().min(0).max(99),
    columns: z.number().int().min(1).max(80),
    rows: z.number().int().min(1).max(80),
    label: z.string().trim().min(1).max(40),
  })).min(1).max(30),
}).strict()

export type ForumPlan = z.infer<typeof forumPlanSchema>

export const forumLayoutIntentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['capacity', 'central_aisle', 'front_cross_aisle', 'rear_cross_aisle', 'side_aisles', 'entrances', 'interpretation'],
  properties: {
    capacity: { type: 'integer', description: 'Cantidad total exacta de sillas solicitadas.' },
    central_aisle: { type: 'boolean', description: 'Verdadero si se solicita un pasillo vertical central.' },
    front_cross_aisle: { type: 'boolean', description: 'Verdadero si se solicita un pasillo transversal delante de las sillas.' },
    rear_cross_aisle: { type: 'boolean', description: 'Verdadero si se solicita un pasillo transversal detrás de las sillas.' },
    side_aisles: { type: 'string', enum: ['none', 'left', 'right', 'both'], description: 'Pasillos verticales laterales solicitados.' },
    entrances: { type: 'string', enum: ['none', 'left', 'right', 'both_sides', 'rear_pair'], description: 'Ubicación solicitada de los accesos.' },
    interpretation: { type: 'string', description: 'Resumen breve en español de lo entendido, sin coordenadas.' },
  },
} as const

function pushBlock(
  blocks: ForumPlan['seating_blocks'],
  x: number,
  y: number,
  columns: number,
  rows: number,
  label: string,
) {
  if (columns > 0 && rows > 0) blocks.push({ x, y, columns, rows, label })
}

export function generateForumPlan(intent: ForumLayoutIntent): ForumPlan {
  const hasLeftSideAisle = intent.side_aisles === 'left' || intent.side_aisles === 'both'
  const hasRightSideAisle = intent.side_aisles === 'right' || intent.side_aisles === 'both'
  const centralWidth = intent.central_aisle ? 1 : 0
  const targetSeatColumns = Math.min(80, intent.capacity, Math.max(4, Math.ceil(Math.sqrt(intent.capacity * 1.6))))
  const leftSeatColumns = intent.central_aisle ? Math.ceil(targetSeatColumns / 2) : targetSeatColumns
  const rightSeatColumns = intent.central_aisle ? targetSeatColumns - leftSeatColumns : 0
  const leftMargin = 1
  const leftSideAisleWidth = hasLeftSideAisle ? 1 : 0
  const rightSideAisleWidth = hasRightSideAisle ? 1 : 0
  const leftSeatsX = leftMargin + leftSideAisleWidth
  const centralAisleX = leftSeatsX + leftSeatColumns
  const rightSeatsX = centralAisleX + centralWidth
  const rightEdge = rightSeatsX + rightSeatColumns + rightSideAisleWidth
  const columns = Math.max(6, rightEdge + 1)
  const seatRows = Math.ceil(intent.capacity / targetSeatColumns)
  const stageHeight = 2
  const frontAisleHeight = intent.front_cross_aisle ? 1 : 0
  const rearAisleHeight = intent.rear_cross_aisle ? 1 : 0
  const seatingY = stageHeight + frontAisleHeight
  const rearAisleY = seatingY + seatRows
  const rows = Math.max(6, rearAisleY + rearAisleHeight + 1)

  const aisles: ForumPlan['aisles'] = []
  if (intent.front_cross_aisle) aisles.push({ x: 1, y: stageHeight, width: columns - 2, height: 1, label: 'Pasillo frontal', axis: 'horizontal' })
  if (intent.rear_cross_aisle) aisles.push({ x: 1, y: rearAisleY, width: columns - 2, height: 1, label: 'Pasillo posterior', axis: 'horizontal' })
  if (intent.central_aisle) aisles.push({ x: centralAisleX, y: seatingY, width: 1, height: seatRows, label: 'Pasillo central', axis: 'vertical' })
  if (hasLeftSideAisle) aisles.push({ x: 1, y: seatingY, width: 1, height: seatRows, label: 'Pasillo lateral izquierdo', axis: 'vertical' })
  if (hasRightSideAisle) aisles.push({ x: rightSeatsX + rightSeatColumns, y: seatingY, width: 1, height: seatRows, label: 'Pasillo lateral derecho', axis: 'vertical' })

  const entrances: ForumPlan['entrances'] = []
  const lateralY = seatingY + Math.floor((seatRows - 1) / 2)
  if (intent.entrances === 'left' || intent.entrances === 'both_sides') entrances.push({ x: 0, y: lateralY, width: 1, height: 1, label: 'Entrada lateral izquierda' })
  if (intent.entrances === 'right' || intent.entrances === 'both_sides') entrances.push({ x: columns - 1, y: lateralY, width: 1, height: 1, label: 'Entrada lateral derecha' })
  if (intent.entrances === 'rear_pair') {
    entrances.push({ x: Math.max(1, Math.floor(columns / 4)), y: rows - 1, width: 1, height: 1, label: 'Entrada posterior izquierda' })
    entrances.push({ x: Math.min(columns - 2, Math.floor(columns * 3 / 4)), y: rows - 1, width: 1, height: 1, label: 'Entrada posterior derecha' })
  }

  const seatingBlocks: ForumPlan['seating_blocks'] = []
  const completeRows = Math.floor(intent.capacity / targetSeatColumns)
  const remainingSeats = intent.capacity % targetSeatColumns
  if (intent.central_aisle) {
    pushBlock(seatingBlocks, leftSeatsX, seatingY, leftSeatColumns, completeRows, 'Izquierdo')
    pushBlock(seatingBlocks, rightSeatsX, seatingY, rightSeatColumns, completeRows, 'Derecho')
    const remainingLeft = Math.min(remainingSeats, leftSeatColumns)
    const remainingRight = remainingSeats - remainingLeft
    pushBlock(seatingBlocks, leftSeatsX, seatingY + completeRows, remainingLeft, 1, 'Izquierdo final')
    pushBlock(seatingBlocks, rightSeatsX, seatingY + completeRows, remainingRight, 1, 'Derecho final')
  } else {
    pushBlock(seatingBlocks, leftSeatsX, seatingY, targetSeatColumns, completeRows, 'Central')
    pushBlock(seatingBlocks, leftSeatsX, seatingY + completeRows, remainingSeats, 1, 'Central final')
  }

  const plan: ForumPlan = {
    summary: intent.interpretation,
    columns,
    rows,
    capacity: intent.capacity,
    stage: { x: 1, y: 0, width: columns - 2, height: stageHeight, label: 'Escenario' },
    aisles,
    entrances,
    seating_blocks: seatingBlocks,
  }
  const parsed = forumPlanSchema.safeParse(plan)
  if (!parsed.success) throw new Error(`El motor produjo un plano fuera del esquema: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`)
  const invalid = validateForumPlan(parsed.data)
  if (invalid) throw new Error(invalid)
  return parsed.data
}

export function validateForumPlan(plan: ForumPlan): string | null {
  const rectangles = [
    { ...plan.stage, type: 'escenario' },
    ...plan.aisles.map(item => ({ ...item, type: 'pasillo' })),
    ...plan.entrances.map(item => ({ ...item, type: 'entrada' })),
    ...plan.seating_blocks.map(item => ({ x: item.x, y: item.y, width: item.columns, height: item.rows, type: 'bloque de sillas' })),
  ]
  for (const rect of rectangles) {
    if (rect.x + rect.width > plan.columns || rect.y + rect.height > plan.rows) return `El ${rect.type} queda fuera de la cuadrícula.`
  }
  for (let index = 0; index < rectangles.length; index += 1) {
    for (let other = index + 1; other < rectangles.length; other += 1) {
      const a = rectangles[index], b = rectangles[other]
      if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) return `La propuesta superpone ${a.type} y ${b.type}.`
    }
  }
  if (plan.aisles.some(item => (item.axis === 'vertical' && item.height < item.width) || (item.axis === 'horizontal' && item.width < item.height))) return 'La orientación de un pasillo no coincide con sus dimensiones.'
  const calculatedCapacity = plan.seating_blocks.reduce((total, block) => total + block.columns * block.rows, 0)
  return calculatedCapacity === plan.capacity ? null : 'La capacidad no coincide con los bloques de sillas.'
}
