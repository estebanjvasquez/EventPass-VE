-- Explicitly expose this RLS-protected public-site registry through PostgREST.
-- The policies in 20260915121224_public_event_and_program_sites.sql still
-- restrict anonymous clients to active sites and members to their organization.
grant select on table public.public_sites to anon;
grant select, insert, update, delete on table public.public_sites to authenticated;
