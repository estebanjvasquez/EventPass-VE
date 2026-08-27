-- Carga idempotente de expositores solicitados para Expo Energia 2026.
with target_event as (
  select organization_id from public.events where id = '276e4d25-b107-4393-9530-542db8ed03a3'::uuid
), exhibitor_names(name) as (
  values
    ('Banesco'), ('Evergreen'), ('Digitel'), ('Hilti'),
    ('Constructora y Proyectos del Norte'), ('A&J Supply'), ('Topieca'),
    ('Alex Bix Oil'), ('Grupo Petroamérica'), ('Tuboauto'),
    ('Coatings de Oriente'), ('SIMCA'), ('Pérez Burelli & Calzadilla'),
    ('Comercial Santiago Oriente'), ('Hidrocaven'), ('Nitrox'),
    ('Movistar'), ('Lindsay'), ('ENI'), ('Repsol')
)
insert into public.companies (organization_id, name, kind)
select target_event.organization_id, exhibitor_names.name, 'exhibitor'
from target_event cross join exhibitor_names
on conflict (organization_id, name) do update set kind = 'exhibitor';
