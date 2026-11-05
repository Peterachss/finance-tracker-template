-- handle_new_user is an auth trigger only; it must not be callable through /rest/v1/rpc.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
