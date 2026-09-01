-- Branding del entorno de demostración comercial. Conserva su subdominio para no romper enlaces existentes.
update public.organizations
set
  name = 'Expo Venezuela Energética 2026',
  branding = jsonb_build_object(
    'name', 'Expo Venezuela Energética 2026',
    'logo_url', 'https://eventosfacil.net/branding/eve-2026-logo.svg',
    'color', '#25245B',
    'secondary_color', '#339E48',
    'accent_color', '#DF2A27',
    'highlight_color', '#FFCE07'
  )
where id = '00000000-0000-0000-0000-000000000001';
