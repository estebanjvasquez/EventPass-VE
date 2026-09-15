export type LandingTemplate = "summit" | "expo" | "minimal";
export type LandingBlockType = "event_intro" | "program" | "gallery" | "cta";
export type LandingBlock = {
  id: string;
  type: LandingBlockType;
  enabled: boolean;
  title?: string;
  body?: string;
};
export type LandingConfig = {
  template?: LandingTemplate;
  brand_name?: string;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  cta_label?: string;
  hero_image_url?: string;
  hero_images?: string[];
  gallery_images?: string[];
  logo_url?: string;
  primary_color?: string;
  page_background_color?: string;
  hero_background_color?: string;
  hero_glow_color?: string;
  surface_color?: string;
  text_color?: string;
  muted_text_color?: string;
  cta_text_color?: string;
  hero_gradient_start?: string;
  hero_gradient_end?: string;
  hero_gradient_angle?: number;
  hero_heading_color?: string;
  hero_body_color?: string;
  hero_heading_size?: "md" | "lg" | "xl";
  card_text_color?: string;
  card_muted_text_color?: string;
  show_sponsors?: boolean;
  sponsors_mode?: "static" | "carousel";
  sponsors_title?: string;
  location?: string;
  intro_title?: string;
  intro_body?: string;
  brochure_label?: string;
  brochure_url?: string;
  show_agenda?: boolean;
  show_exhibition?: boolean;
  show_interest?: boolean;
  blocks?: LandingBlock[];
};

export const templateBlocks: Record<LandingTemplate, LandingBlock[]> = {
  summit: [
    { id: "intro", type: "event_intro", enabled: true },
    { id: "program", type: "program", enabled: true },
    { id: "gallery", type: "gallery", enabled: true },
    { id: "cta", type: "cta", enabled: true },
  ],
  expo: [
    { id: "intro", type: "event_intro", enabled: true },
    {
      id: "program",
      type: "program",
      enabled: true,
      title: "Programa, empresas y oportunidades",
    },
    { id: "gallery", type: "gallery", enabled: true },
    { id: "cta", type: "cta", enabled: true },
  ],
  minimal: [
    { id: "intro", type: "event_intro", enabled: true },
    { id: "cta", type: "cta", enabled: true },
  ],
};
