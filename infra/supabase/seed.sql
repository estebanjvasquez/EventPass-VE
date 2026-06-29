-- Datos de demostración para desarrollo local (supabase start / db reset).
-- NO se ejecuta en producción. Las membresías requieren usuarios reales de auth.users.

insert into public.organizations (id, slug, name, plan, status, branding)
values (
  '00000000-0000-0000-0000-000000000001',
  'demo',
  'Asociación Demo',
  'profesional',
  'active',
  '{"color": "#aa3bff", "logo_url": null}'::jsonb
);

insert into public.subscriptions (organization_id, plan, status)
values ('00000000-0000-0000-0000-000000000001', 'profesional', 'active');

insert into public.events (id, organization_id, name, description, event_type, status, total_slots, payment_timeout_days)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'Congreso Anual 2026',
  'Evento de demostración para EventPass VE.',
  'forum',
  'published',
  200,
  10
);

insert into public.payment_methods (organization_id, event_id, name, details, is_active)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'Zelle',
  '{"email": "pagos@demo.org", "titular": "Asociación Demo"}'::jsonb,
  true
);
