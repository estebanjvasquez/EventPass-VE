create or replace function public.admin_update_client(p_org uuid,p_name text,p_slug text,p_custom_hostname text,p_plan public.org_plan,p_status public.org_status)
returns void language plpgsql security definer set search_path=public as $$
declare v_slug text:=lower(trim(p_slug));
begin
 if not public.is_platform_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if length(trim(p_name))<2 then raise exception 'Nombre inválido' using errcode='22023'; end if;
 if v_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then raise exception 'Subdominio inválido' using errcode='22023'; end if;
 if exists(select 1 from public.organizations where slug=v_slug and id<>p_org) then raise exception 'El subdominio ya está en uso' using errcode='unique_violation'; end if;
 update public.organizations set name=trim(p_name),slug=v_slug,custom_hostname=nullif(lower(trim(p_custom_hostname)),''),plan=p_plan,status=p_status where id=p_org;
end $$;
grant execute on function public.admin_update_client(uuid,text,text,text,public.org_plan,public.org_status) to authenticated;
