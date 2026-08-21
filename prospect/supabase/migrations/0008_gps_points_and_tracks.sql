-- 0008 — Points GPS bruts et traces consolidées.
--
-- `gps_points` conserve CHAQUE fix retenu, avec son incertitude : c'est la
-- donnée source, jamais recalculable. `tracks` n'en est qu'une projection
-- destinée à l'affichage et aux statistiques ; elle peut être reconstruite.

create table if not exists public.gps_points (
  -- L'identifiant est généré par le client afin qu'un point créé hors réseau
  -- puisse être renvoyé plusieurs fois sans jamais être dupliqué.
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.sessions (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,

  position             geography(Point, 4326) not null,
  lat                  double precision generated always as (st_y(position::geometry)) stored,
  lon                  double precision generated always as (st_x(position::geometry)) stored,

  -- Horodatage du fix GPS lui-même, pas de son enregistrement en base.
  recorded_at          timestamptz not null,

  accuracy_m           real check (accuracy_m is null or accuracy_m >= 0),
  altitude_m           real,
  altitude_accuracy_m  real check (altitude_accuracy_m is null or altitude_accuracy_m >= 0),
  speed_ms             real check (speed_ms is null or speed_ms >= 0),
  heading_deg          real check (heading_deg is null or (heading_deg >= 0 and heading_deg < 360)),

  -- Un point trop incertain est conservé (on ne jette pas une mesure) mais
  -- exclu de la trace et des distances.
  is_reliable          boolean not null default true,

  created_at           timestamptz not null default now()
);

comment on table public.gps_points is
  'Points GPS bruts d''une sortie. Source de vérité, jamais reconstruite.';
comment on column public.gps_points.is_reliable is
  'Faux si l''incertitude dépasse le seuil de l''utilisateur : le point est gardé mais exclu des calculs.';

create index if not exists gps_points_session_time_idx
  on public.gps_points (session_id, recorded_at);

create index if not exists gps_points_user_time_idx
  on public.gps_points (user_id, recorded_at desc);

create index if not exists gps_points_position_gix
  on public.gps_points using gist (position);

-- ---------------------------------------------------------------------------

create table if not exists public.tracks (
  session_id   uuid primary key references public.sessions (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,

  line         geography(LineString, 4326),
  -- Version allégée pour l'affichage à petite échelle (historique, aperçus).
  simplified   geography(LineString, 4326),

  point_count  integer not null default 0 check (point_count >= 0),
  distance_m   numeric(12, 2) not null default 0 check (distance_m >= 0),

  computed_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.tracks is
  'Trace consolidée d''une sortie, dérivée de gps_points. Reconstructible.';

create index if not exists tracks_line_gix on public.tracks using gist (line);
create index if not exists tracks_simplified_gix on public.tracks using gist (simplified);
create index if not exists tracks_user_idx on public.tracks (user_id);

select app.attach_updated_at('public.tracks');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.gps_points enable row level security;
alter table public.tracks     enable row level security;

drop policy if exists gps_points_all_own on public.gps_points;
create policy gps_points_all_own on public.gps_points
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists tracks_all_own on public.tracks;
create policy tracks_all_own on public.tracks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.gps_points to authenticated;
grant select, insert, update, delete on public.tracks     to authenticated;
