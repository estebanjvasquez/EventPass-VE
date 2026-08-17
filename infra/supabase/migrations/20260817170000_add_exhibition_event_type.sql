-- Habilita exposiciones como eventos independientes.
alter type public.event_type add value if not exists 'exhibition';
