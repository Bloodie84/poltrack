-- 0002 — Compatibilité `auth` pour les environnements non-Supabase.
--
-- Sur Supabase, le schéma `auth`, la table `auth.users` et la fonction
-- `auth.uid()` existent déjà : cette migration ne fait alors STRICTEMENT rien.
--
-- En local (Postgres + PostGIS nu, utilisé par `npm run db:migrate` et par les
-- tests d'intégration), elle crée un substitut minimal afin que les clés
-- étrangères et les policies RLS des migrations suivantes soient valides et
-- testables sans dépendre de Supabase.

-- Rôles PostgREST/Supabase. Présents nativement sur Supabase, recréés à
-- l'identique en local pour que les policies `to authenticated` soient valides.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

do $$
begin
  if to_regnamespace('auth') is null then
    create schema auth;
    -- Sur Supabase ces droits existent déjà et le schéma appartient à
    -- supabase_auth_admin : on ne les accorde donc QUE si l'on vient de créer
    -- le schéma nous-mêmes.
    grant usage on schema auth to anon, authenticated, service_role;
  end if;
end
$$;

do $$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz not null default now()
    );

    comment on table auth.users is
      'Substitut local de auth.users (Supabase GoTrue). Jamais créé sur Supabase.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $fn$;
  end if;
end
$$;

