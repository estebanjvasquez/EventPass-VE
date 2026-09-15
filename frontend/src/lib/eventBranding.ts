import type { LandingConfig } from "./landingBuilder";
import type { Tenant } from "./tenantCore";

/** The published landing owns the event identity; organization branding is legacy fallback. */
export type PublicEventBrand = {
  name: string;
  logo_url: string | null;
  color: string;
};
type BrandableEvent = {
  name?: string | null;
  config?: Record<string, unknown> | null;
};

export function resolvePublicEventBrand(
  event?: BrandableEvent | null,
  tenant?: Pick<Tenant, "name" | "branding"> | null,
): PublicEventBrand {
  const config = (event?.config?.public_landing ?? {}) as LandingConfig;
  return {
    name:
      config.brand_name?.trim() ||
      event?.name?.trim() ||
      tenant?.branding?.name ||
      tenant?.name ||
      "Evento",
    logo_url: config.logo_url?.trim() || tenant?.branding?.logo_url || null,
    color: config.primary_color?.trim() || tenant?.branding?.color || "#047857",
  };
}
