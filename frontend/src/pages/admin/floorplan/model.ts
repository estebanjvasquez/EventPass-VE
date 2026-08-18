export type FloorplanStatus = 'available' | 'reserved' | 'assigned' | 'blocked'

export type FloorplanRect = {
  x: number
  y: number
  width: number
  height: number
}

export type FloorplanElement = FloorplanRect & {
  id: string
  label: string
  kind: 'stand' | 'aisle' | 'zone' | 'object'
  status?: FloorplanStatus
  objectType?: 'door' | 'access' | 'security' | 'column' | 'plant' | 'lobby' | 'information' | 'blank' | 'special'
  purpose?: string
}

export const intersects = (a: FloorplanRect, b: FloorplanRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

export const palette = [
  { objectType: 'stand', label: 'Stand', width: 1, height: 1 },
  { objectType: 'aisle', label: 'Pasillo', width: 1, height: 1 },
  { objectType: 'door', label: 'Puerta', width: 1, height: 1 },
  { objectType: 'access', label: 'Acceso', width: 1, height: 1 },
  { objectType: 'security', label: 'Verificador', width: 1, height: 1 },
  { objectType: 'column', label: 'Columna', width: 1, height: 1 },
  { objectType: 'plant', label: 'Planta', width: 1, height: 1 },
  { objectType: 'lobby', label: 'Lobby', width: 3, height: 2 },
  { objectType: 'information', label: 'Información', width: 3, height: 1 },
  { objectType: 'blank', label: 'Espacio libre', width: 2, height: 2 },
  { objectType: 'special', label: 'Área especial', width: 3, height: 2 },
] as const
