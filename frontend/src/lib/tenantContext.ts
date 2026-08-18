import { createContext } from 'react'
import type { Tenant } from './tenantCore'

export type TenantContextValue = { tenant: Tenant | null; loading: boolean }

export const TenantContext = createContext<TenantContextValue | undefined>(undefined)
