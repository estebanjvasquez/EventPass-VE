-- El trigger se ejecuta internamente al mover una silla; no es una API pública.
revoke all on function public.sync_forum_seat_position() from public, anon, authenticated;
