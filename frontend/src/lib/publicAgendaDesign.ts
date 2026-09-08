export type SponsorMode = 'logos' | 'names' | 'both' | 'none';
export type AgendaSettings = {
  title?: string; subtitle?: string; published?: boolean;
  accent_color?: string; background_color?: string; text_color?: string;
  font_family?: 'outfit' | 'arial' | 'georgia' | 'mono';
  text_scale?: 'compact' | 'normal' | 'large';
  layout?: 'cards' | 'timeline' | 'split';
  ticker_text?: string; ticker_animated?: boolean; ticker_seconds?: number;
  ticker_direction?: 'left' | 'right'; logo_size?: number;
  activity_sponsors?: SponsorMode; event_sponsors?: SponsorMode;
  show_sponsors?: boolean; show_schedule?: boolean; show_current?: boolean; show_next?: boolean;
  show_clock?: boolean; show_speakers?: boolean; show_locations?: boolean; show_cancelled?: boolean;
  stage_filter?: string; refresh_seconds?: number;
};
export const agendaPresets = [
  { name: 'Auditorio nocturno', description: 'Fondo oscuro y acento esmeralda.', background_color: '#101b24', text_color: '#f4f7fa', accent_color: '#6ee7b7' },
  { name: 'Corporativo claro', description: 'Lectura nítida para salones iluminados.', background_color: '#f3f5f7', text_color: '#172b3a', accent_color: '#006b54' },
  { name: 'Petróleo y energía', description: 'Azul profundo y acento dorado.', background_color: '#102a43', text_color: '#f5f7fa', accent_color: '#f7cc72' },
] as const;
export function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    if (!/^#[\da-f]{6}$/i.test(hex)) return NaN;
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function sponsorMode(settings: AgendaSettings, scope: 'activity' | 'event'): SponsorMode {
  const explicit = scope === 'activity' ? settings.activity_sponsors : settings.event_sponsors;
  if (explicit && ['logos', 'names', 'both', 'none'].includes(explicit)) return explicit;
  return settings.show_sponsors === false ? 'none' : scope === 'activity' ? 'names' : 'both';
}
export function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
