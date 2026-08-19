-- Endurecimiento de Fase 4: impide relacionar avisos, preguntas o encuestas
-- con sesiones de otro evento u organización.

drop policy if exists announcements_member_all on public.event_announcements;
create policy announcements_member_all on public.event_announcements for all to authenticated
using (
  (public.is_org_member(organization_id) or public.is_platform_admin())
  and (session_id is null or exists (
    select 1 from public.event_sessions s
    where s.id = public.event_announcements.session_id and s.event_id = public.event_announcements.event_id and s.organization_id = public.event_announcements.organization_id
  ))
) with check (
  (public.is_org_member(organization_id) or public.is_platform_admin())
  and (session_id is null or exists (
    select 1 from public.event_sessions s
    where s.id = public.event_announcements.session_id and s.event_id = public.event_announcements.event_id and s.organization_id = public.event_announcements.organization_id
  ))
);

drop policy if exists questions_member_all on public.session_questions;
create policy questions_member_all on public.session_questions for all to authenticated
using (
  (public.is_org_member(organization_id) or public.is_platform_admin())
  and exists (
    select 1 from public.event_sessions s
    where s.id = public.session_questions.session_id and s.event_id = public.session_questions.event_id and s.organization_id = public.session_questions.organization_id
  )
) with check (
  (public.is_org_member(organization_id) or public.is_platform_admin())
  and exists (
    select 1 from public.event_sessions s
    where s.id = public.session_questions.session_id and s.event_id = public.session_questions.event_id and s.organization_id = public.session_questions.organization_id
  )
);

drop policy if exists polls_member_all on public.session_polls;
create policy polls_member_all on public.session_polls for all to authenticated
using (
  (public.is_org_member(organization_id) or public.is_platform_admin())
  and exists (
    select 1 from public.event_sessions s
    where s.id = public.session_polls.session_id and s.event_id = public.session_polls.event_id and s.organization_id = public.session_polls.organization_id
  )
) with check (
  (public.is_org_member(organization_id) or public.is_platform_admin())
  and exists (
    select 1 from public.event_sessions s
    where s.id = public.session_polls.session_id and s.event_id = public.session_polls.event_id and s.organization_id = public.session_polls.organization_id
  )
);
