import type { LandingConfig } from "./landingBuilder";
/** The published landing is the sole public identity of an event. */
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
): PublicEventBrand {
  const config = (event?.config?.public_landing ?? {}) as LandingConfig;
  return {
    name:
      config.brand_name?.trim() ||
      event?.name?.trim() || "Evento",
    logo_url: config.logo_url?.trim() || null,
    color: config.primary_color?.trim() || "#047857",
  };
}
