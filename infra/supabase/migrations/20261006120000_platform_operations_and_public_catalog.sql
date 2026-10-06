-- Operación integral de plataforma: usuarios, planes, estadísticas y catálogo.

alter table public.plans add column if not exists description text;
alter table public.plans add column if not exists is_active boolean not null default true;

alter table public.events add column if not exists platform_featured boolean not null default false;
alter table public.events add column if not exists platform_feature_order integer not null default 0;
alter table public.events add column if not exists platform_featured_at timestamptz;
create index if not exists idx_events_platform_catalog
  on public.events(platform_featured, platform_feature_order, start_date)
  where platform_featured = true;

create table if not exists public.platform_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended_at timestamptz,
  suspension_reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.platform_user_controls enable row level security;
drop policy if exists platform_user_controls_admin on public.platform_user_controls;
create policy platform_user_controls_admin on public.platform_user_controls
  for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

-- La suspensión se aplica en la función central usada por las políticas RLS.
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id=m.organization_id
    left join public.platform_user_controls c on c.user_id=m.user_id
    where m.organization_id=org and m.user_id=auth.uid()
      and o.status <> 'suspended' and c.suspended_at is null
  );
$$;

create or replace function public.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id=m.organization_id
    left join public.platform_user_controls c on c.user_id=m.user_id
    where m.organization_id=org and m.user_id=auth.uid() and m.role=any(roles)
      and o.status <> 'suspended' and c.suspended_at is null
  );
$$;

create or replace function public.current_platform_access()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'user_suspended', exists(select 1 from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null),
    'has_active_organization', exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid() and o.status<>'suspended'),
    'suspension_reason', (select suspension_reason from public.platform_user_controls where user_id=auth.uid() and suspended_at is not null)
  );
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.is_platform_admin() then jsonb_build_object(
    'organizations', (select count(*) from public.organizations),
    'active_organizations', (select count(*) from public.organizations where status='active'),
    'suspended_organizations', (select count(*) from public.organizations where status='suspended'),
    'users', (select count(*) from auth.users),
    'suspended_users', (select count(*) from public.platform_user_controls where suspended_at is not null),
    'events', (select count(*) from public.events where status<>'archived'),
    'published_events', (select count(*) from public.events where status='published'),
    'featured_events', (select count(*) from public.events where platform_featured),
    'registrations', (select count(*) from public.registrations),
    'registrations_30d', (select count(*) from public.registrations where created_at>=now()-interval '30 days'),
    'pending_payments', (select count(*) from public.subscription_payments where status='pending'),
    'top_organizations', (select coalesce(jsonb_agg(x),'[]'::jsonb) from (
      select o.id,o.name,o.plan,o.status,count(r.id) registration_count
      from public.organizations o left join public.registrations r on r.organization_id=o.id
      group by o.id order by count(r.id) desc,o.name limit 8
    ) x)
  ) else null end;
$$;

create or replace function public.admin_users()
returns table(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,organizations jsonb,member_count bigint,suspended boolean,suspension_reason text)
language sql stable security definer set search_path=public as $$
  select u.id,u.email::text,u.created_at,u.last_sign_in_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role,'status',o.status) order by o.name) from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=u.id),'[]'::jsonb),
    (select count(*) from public.memberships m where m.user_id=u.id),
    c.suspended_at is not null,c.suspension_reason
  from auth.users u left join public.platform_user_controls c on c.user_id=u.id
  where public.is_platform_admin()
  order by u.created_at desc;
$$;

create or replace function public.admin_set_user_suspension(p_user uuid,p_suspended boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
  if exists(select 1 from public.platform_admins where user_id=p_user) then raise exception 'No se puede suspender un superadministrador'; end if;
  insert into public.platform_user_controls(user_id,suspended_at,suspension_reason,updated_by,updated_at)
  values(p_user,case when p_suspended then now() end,case when p_suspended then nullif(trim(p_reason),'') end,auth.uid(),now())
  on conflict(user_id) do update set suspended_at=excluded.suspended_at,suspension_reason=excluded.suspension_reason,updated_by=excluded.updated_by,updated_at=now();
end $$;

create or replace function public.admin_update_plan(p_plan public.org_plan,p_name text,p_description text,p_price numeric,p_max_events int,p_max_regs int,p_active boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
  if coalesce(trim(p_name),'')='' or p_price<0 or p_max_events<1 or p_max_regs<1 then raise exception 'Datos de plan inválidos'; end if;
  update public.plans set name=trim(p_name),description=nullif(trim(p_description),''),price_usd=p_price,max_events=p_max_events,max_regs_per_event=p_max_regs,is_active=p_active where plan=p_plan;
end $$;

create or replace function public.admin_catalog_events()
returns table(id uuid,organization_id uuid,organization_name text,name text,event_type public.event_type,status public.event_status,start_date timestamptz,end_date timestamptz,location text,featured boolean,feature_order int,registration_count bigint)
language sql stable security definer set search_path=public as $$
  select e.id,e.organization_id,o.name,e.name,e.event_type,e.status,e.start_date,e.end_date,
    coalesce(nullif(e.config->>'location',''),nullif(e.config->>'venue','')),
    e.platform_featured,e.platform_feature_order,(select count(*) from public.registrations r where r.event_id=e.id)
  from public.events e join public.organizations o on o.id=e.organization_id
  where public.is_platform_admin() and e.status<>'archived'
  order by e.platform_featured desc,e.platform_feature_order,e.start_date nulls last;
$$;

create or replace function public.admin_set_event_featured(p_event uuid,p_featured boolean,p_order int default 0)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
  if p_featured and not exists(select 1 from public.events e join public.organizations o on o.id=e.organization_id where e.id=p_event and e.status='published' and o.status='active') then
    raise exception 'Solo se pueden destacar eventos publicados de organizaciones activas';
  end if;
  update public.events set platform_featured=p_featured,platform_feature_order=greatest(coalesce(p_order,0),0),platform_featured_at=case when p_featured then coalesce(platform_featured_at,now()) end where id=p_event;
end $$;

create or replace function public.get_platform_event_catalog()
returns table(id uuid,name text,description text,event_type public.event_type,start_date timestamptz,end_date timestamptz,location text,organization_name text,hero_image text,min_price numeric,currency text)
language sql stable security definer set search_path=public as $$
  select e.id,e.name,e.description,e.event_type,e.start_date,e.end_date,
    coalesce(nullif(e.config->>'location',''),nullif(e.config->>'venue','')),
    o.name,
    coalesce(ps.landing_config->'hero_images'->>0,ps.landing_config->>'hero_image_url',e.config->'public_landing'->'hero_images'->>0,e.config->'public_landing'->>'hero_image_url'),
    (select min(c.price) from public.event_ticket_categories c where c.event_id=e.id and c.published),
    coalesce((select c.currency from public.event_ticket_categories c where c.event_id=e.id and c.published order by c.price limit 1),nullif(e.config->>'currency',''),'USD')
  from public.events e
  join public.organizations o on o.id=e.organization_id and o.status='active'
  left join public.public_sites ps on ps.event_id=e.id and ps.status='active'
  where e.platform_featured and e.status='published' and (e.end_date is null or e.end_date>=now())
  order by e.platform_feature_order,e.start_date nulls last,e.name;
$$;

revoke all on function public.current_platform_access(),public.admin_dashboard_stats(),public.admin_users(),public.admin_set_user_suspension(uuid,boolean,text),public.admin_update_plan(public.org_plan,text,text,numeric,int,int,boolean),public.admin_catalog_events(),public.admin_set_event_featured(uuid,boolean,int),public.get_platform_event_catalog() from public;
grant execute on function public.current_platform_access() to authenticated;
grant execute on function public.admin_dashboard_stats(),public.admin_users(),public.admin_set_user_suspension(uuid,boolean,text),public.admin_update_plan(public.org_plan,text,text,numeric,int,int,boolean),public.admin_catalog_events(),public.admin_set_event_featured(uuid,boolean,int) to authenticated;
grant execute on function public.get_platform_event_catalog() to anon,authenticated;
