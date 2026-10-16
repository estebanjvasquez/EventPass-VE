import { useSyncExternalStore } from 'react'

const MODE_KEY = 'admin_navigation_mode'
const MODE_EVENT = 'admin-navigation-mode-changed'
export const platformSections = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'comercial', label: 'Comercial y soporte' },
  { id: 'clientes', label: 'Organizaciones y soporte' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'planes', label: 'Catálogo base' },
  { id: 'catalogo', label: 'Eventos públicos' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'supers', label: 'Superadmins' },
  { id: 'pagos_plataforma', label: 'Datos de pago' },
] as const
export type PlatformTab = typeof platformSections[number]['id']
export function platformTab(value: string | null): PlatformTab {
  return platformSections.find(section => section.id === value)?.id ?? 'resumen'
}
export function platformUrl(tab: PlatformTab = 'resumen') { return `/superadmin?tab=${tab}` }
export function getAdminMode(): 'platform' | 'organization' {
  const saved = sessionStorage.getItem(MODE_KEY)
  return saved === 'organization' || (!saved && sessionStorage.getItem('impersonate_org')) ? 'organization' : 'platform'
}
export function setAdminMode(mode: 'platform' | 'organization') {
  if (mode === 'platform') sessionStorage.removeItem('impersonate_org')
  sessionStorage.setItem(MODE_KEY, mode)
  window.dispatchEvent(new Event(MODE_EVENT))
}
export function enterOwnOrganization() {
  sessionStorage.removeItem('impersonate_org')
  setAdminMode('organization')
}
function subscribe(callback: () => void) {
  window.addEventListener(MODE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(MODE_EVENT, callback); window.removeEventListener('storage', callback) }
}
export function useAdminMode() { return useSyncExternalStore(subscribe, getAdminMode, () => 'platform') }
