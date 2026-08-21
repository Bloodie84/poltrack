-- 0007 — Sorties de détection.
--
-- Une sortie est l'unité de temps du carnet : elle porte le chronomètre, le
-- matériel utilisé et la largeur de balayage figée au démarrage.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type session_status as enum ('active', 'paused', 'finished');
  end if;
end
$$;

create table if not exists public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  status             session_status not null default 'active',

  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  -- Temps cumulé en pause, hors pause en cours.
  paused_seconds     integer not null default 0 check (paused_seconds >= 0),
  -- Début de la pause en cours, NULL si la sortie n'est pas en pause.
  paused_at          timestamptz,

  title              text check (title is null or char_length(title) between 1 and 120),
  notes              text check (notes is null or char_length(notes) <= 4000),

  -- ON DELETE SET NULL : retirer un détecteur ne doit pas effacer une sortie.
  detector_id        uuid references public.detectors (id) on delete set null,
  detector_preset_id uuid references public.detector_presets (id) on delete set null,

  -- Largeur figée au démarrage : changer le réglage plus tard ne doit pas
  -- réécrire la couverture des sorties déjà faites.
  sweep_width_m      numeric(4, 2) not null
                       check (sweep_width_m between 0.20 and 10.00),

  start_point        geography(Point, 4326),
  start_lat          double precision generated always as (st_y(start_point::geometry)) stored,
  start_lon          double precision generated always as (st_x(start_point::geometry)) stored,

  -- Point de retour : voiture, entrée du terrain, sac…
  vehicle_point      geography(Point, 4326),
  vehicle_lat        double precision generated always as (st_y(vehicle_point::geometry)) stored,
  vehicle_lon        double precision generated always as (st_x(vehicle_point::geometry)) stored,
  vehicle_label      text check (vehicle_label is null or char_length(vehicle_label) <= 60),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  constraint sessions_end_after_start check (ended_at is null or ended_at >= started_at),
  constraint sessions_paused_consistency check ((status = 'paused') = (paused_at is not null)),
  constraint sessions_finished_consistency check ((status = 'finished') = (ended_at is not null))
);

comment on table public.sessions is 'Une sortie de détection, de son démarrage à sa fin.';
comment on column public.sessions.sweep_width_m is
  'Largeur de prospection retenue au démarrage, en mètres. Figée volontairement.';
comment on column public.sessions.vehicle_point is
  'Point de retour enregistré au démarrage. Donnée privée.';

-- Une seule sortie ouverte à la fois : le terrain n'en permet pas deux.
create unique index if not exists sessions_one_open_per_user
  on public.sessions (user_id)
  where status <> 'finished' and deleted_at is null;

create index if not exists sessions_user_started_idx
  on public.sessions (user_id, started_at desc) where deleted_at is null;

create index if not exists sessions_start_point_gix
  on public.sessions using gist (start_point);

select app.attach_updated_at('public.sessions');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.sessions enable row level security;

drop policy if exists sessions_all_own on public.sessions;
create policy sessions_all_own on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.sessions to authenticated;
