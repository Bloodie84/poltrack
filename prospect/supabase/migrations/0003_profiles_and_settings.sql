-- 0003 — Profils utilisateurs et préférences.
--
-- `profiles` étend auth.users avec les données applicatives.
-- `user_settings` porte les préférences (unités, largeur de balayage par
-- défaut, stratégie d'échantillonnage GPS…) consommées dès la phase 2.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  -- Point d'ouverture par défaut de la carte. Géographie => distances en mètres.
  home_point    geography(Point, 4326),
  -- PostgREST sérialise `geography` en EWKB hexadécimal : ces colonnes
  -- générées donnent au client des coordonnées directement exploitables.
  home_lat      double precision generated always as (st_y(home_point::geometry)) stored,
  home_lon      double precision generated always as (st_x(home_point::geometry)) stored,
  home_zoom     real not null default 13 check (home_zoom between 0 and 22),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint profiles_display_name_len check (
    display_name is null or char_length(display_name) between 1 and 80
  )
);

comment on table public.profiles is 'Profil applicatif, 1-1 avec auth.users.';
comment on column public.profiles.home_point is
  'Position d''ouverture de la carte (WGS84). Donnée privée.';

create index if not exists profiles_home_point_gix
  on public.profiles using gist (home_point);

select app.attach_updated_at('public.profiles');

-- L'écriture d'un point passe par une RPC : le client envoie lat/lon, le
-- serveur valide et construit la géométrie. SECURITY INVOKER => la RLS
-- s'applique normalement.
create or replace function public.set_home_point(
  p_lat  double precision,
  p_lon  double precision,
  p_zoom real default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_lat is null or p_lon is null then
    update public.profiles
       set home_point = null,
           home_zoom  = coalesce(p_zoom, home_zoom)
     where id = (select auth.uid());
    return;
  end if;

  if p_lat < -90 or p_lat > 90 then
    raise exception 'Latitude hors bornes: %', p_lat using errcode = '22023';
  end if;
  if p_lon < -180 or p_lon > 180 then
    raise exception 'Longitude hors bornes: %', p_lon using errcode = '22023';
  end if;

  update public.profiles
     set home_point = st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
         home_zoom  = coalesce(p_zoom, home_zoom)
   where id = (select auth.uid());
end;
$$;

comment on function public.set_home_point is
  'Définit (ou efface si p_lat/p_lon sont NULL) le point d''ouverture de la carte.';

-- ---------------------------------------------------------------------------

create table if not exists public.user_settings (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  units                  unit_system not null default 'metric',
  locale                 text not null default 'fr' check (locale in ('fr', 'en')),
  theme                  text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  default_basemap        text not null default 'osm',

  -- Largeur de prospection par défaut (mètres) — utilisée par la couverture.
  default_sweep_width_m  numeric(4, 2) not null default 2.00
                           check (default_sweep_width_m between 0.20 and 10.00),

  -- Stratégie d'échantillonnage GPS (phase 2). Stockée côté serveur pour être
  -- identique sur tous les appareils de l'utilisateur.
  gps_min_interval_s     integer not null default 3  check (gps_min_interval_s between 1 and 60),
  gps_min_distance_m     numeric(5, 2) not null default 2.00
                           check (gps_min_distance_m between 0.00 and 100.00),
  gps_max_accuracy_m     numeric(6, 2) not null default 30.00
                           check (gps_max_accuracy_m between 1.00 and 500.00),

  keep_screen_awake      boolean not null default true,
  default_privacy        privacy_level not null default 'private',

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.user_settings is
  'Préférences utilisateur. Une ligne par profil, créée automatiquement.';
comment on column public.user_settings.gps_max_accuracy_m is
  'Au-delà de cette incertitude, un point GPS est enregistré mais marqué comme peu fiable.';

select app.attach_updated_at('public.user_settings');

-- ---------------------------------------------------------------------------
-- Provisionnement automatique à l'inscription
-- ---------------------------------------------------------------------------

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function app.handle_new_user() is
  'Crée profil + préférences dès la création d''un compte auth.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS : chaque utilisateur ne voit que ses propres lignes.
-- ---------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- INSERT est autorisé uniquement pour sa propre ligne : filet de sécurité si
-- le trigger n'a pas été installé (base restaurée, projet migré à la main).
-- La suppression passe exclusivement par la cascade depuis auth.users.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;
grant execute on function public.set_home_point(double precision, double precision, real) to authenticated;
grant select, insert, update on public.user_settings to authenticated;
