-- 0009 — Opérations de sortie.
--
-- Toutes ces fonctions sont SECURITY INVOKER : la RLS s'applique normalement et
-- le filtre explicite sur user_id les garde correctes même hors RLS.

-- Le schéma `app` reste hors de l'API : `authenticated` a seulement besoin
-- d'exécuter le helper d'authentification appelé par les fonctions publiques.
-- Par défaut PostgreSQL accorde EXECUTE à PUBLIC : on le retire explicitement.
grant usage on schema app to authenticated, service_role;
revoke all on all functions in schema app from public;

create or replace function app.require_user()
returns uuid
language plpgsql
stable
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;
  return v_user;
end;
$$;

grant execute on function app.require_user() to authenticated;

-- ---------------------------------------------------------------------------
-- Reconstruction de la trace
-- ---------------------------------------------------------------------------

create or replace function public.rebuild_track(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := app.require_user();
  v_geom  geometry;
  v_count integer;
  v_line  geography(LineString, 4326);
begin
  if not exists (
    select 1 from public.sessions
     where id = p_session_id and user_id = v_user and deleted_at is null
  ) then
    raise exception 'Sortie introuvable' using errcode = 'P0002';
  end if;

  select st_makeline(p.position::geometry order by p.recorded_at, p.id), count(*)
    into v_geom, v_count
    from public.gps_points p
   where p.session_id = p_session_id
     and p.user_id = v_user
     and p.is_reliable;

  -- Une ligne exige au moins deux sommets distincts ; en dessous, la trace
  -- reste vide plutôt que d'inventer une géométrie.
  v_line := case
              when v_count >= 2 and st_geometrytype(v_geom) = 'ST_LineString'
                then v_geom::geography
              else null
            end;

  insert into public.tracks (
    session_id, user_id, line, simplified, point_count, distance_m, computed_at
  )
  values (
    p_session_id,
    v_user,
    v_line,
    -- ~2 m de tolérance : suffisant pour alléger l'affichage sans déformer
    -- le tracé au-delà de l'incertitude du GPS lui-même.
    case when v_line is null then null
         else st_simplifypreservetopology(v_line::geometry, 0.00002)::geography end,
    coalesce(v_count, 0),
    coalesce(st_length(v_line), 0),
    now()
  )
  on conflict (session_id) do update
     set line        = excluded.line,
         simplified  = excluded.simplified,
         point_count = excluded.point_count,
         distance_m  = excluded.distance_m,
         computed_at = excluded.computed_at;
end;
$$;

comment on function public.rebuild_track is
  'Recalcule la trace consolidée d''une sortie à partir de ses points fiables.';

-- ---------------------------------------------------------------------------
-- Cycle de vie d'une sortie
-- ---------------------------------------------------------------------------

create or replace function public.start_session(
  p_lat           double precision default null,
  p_lon           double precision default null,
  p_sweep_width_m numeric default null,
  p_detector_id   uuid default null,
  p_title         text default null,
  p_save_vehicle  boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := app.require_user();
  v_point geography(Point, 4326);
  v_width numeric(4, 2);
  v_id    uuid;
begin
  if exists (
    select 1 from public.sessions
     where user_id = v_user and status <> 'finished' and deleted_at is null
  ) then
    raise exception 'Une sortie est déjà en cours' using errcode = '55000';
  end if;

  if p_lat is not null and p_lon is not null then
    if p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
      raise exception 'Coordonnées hors bornes' using errcode = '22023';
    end if;
    v_point := st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography;
  end if;

  v_width := coalesce(
    p_sweep_width_m,
    (select default_sweep_width_m from public.user_settings where user_id = v_user),
    2.00
  );

  insert into public.sessions (
    user_id, status, started_at, sweep_width_m, start_point,
    vehicle_point, vehicle_label, detector_id, title
  )
  values (
    v_user, 'active', now(), v_width, v_point,
    case when p_save_vehicle then v_point end,
    case when p_save_vehicle and v_point is not null then 'Départ' end,
    coalesce(
      p_detector_id,
      (select id from public.detectors
        where user_id = v_user and is_default and deleted_at is null limit 1)
    ),
    nullif(btrim(coalesce(p_title, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.pause_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.require_user();
begin
  update public.sessions
     set status = 'paused', paused_at = now()
   where id = p_session_id and user_id = v_user and status = 'active';

  if not found then
    raise exception 'Aucune sortie active à mettre en pause' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.resume_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.require_user();
begin
  update public.sessions
     set status = 'active',
         paused_seconds = paused_seconds
           + greatest(0, floor(extract(epoch from (now() - paused_at)))::integer),
         paused_at = null
   where id = p_session_id and user_id = v_user and status = 'paused';

  if not found then
    raise exception 'Aucune sortie en pause à reprendre' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.finish_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.require_user();
begin
  update public.sessions
     set status = 'finished',
         ended_at = now(),
         -- Terminer depuis la pause : le temps de pause en cours est soldé.
         paused_seconds = paused_seconds
           + case when paused_at is null then 0
                  else greatest(0, floor(extract(epoch from (now() - paused_at)))::integer)
             end,
         paused_at = null
   where id = p_session_id and user_id = v_user and status <> 'finished'
     and deleted_at is null;

  if not found then
    raise exception 'Aucune sortie en cours à terminer' using errcode = 'P0002';
  end if;

  perform public.rebuild_track(p_session_id);
end;
$$;

create or replace function public.set_vehicle_point(
  p_session_id uuid,
  p_lat        double precision,
  p_lon        double precision,
  p_label      text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.require_user();
begin
  if p_lat is null or p_lon is null then
    update public.sessions
       set vehicle_point = null, vehicle_label = null
     where id = p_session_id and user_id = v_user;
  else
    if p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
      raise exception 'Coordonnées hors bornes' using errcode = '22023';
    end if;

    update public.sessions
       set vehicle_point = st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
           vehicle_label = nullif(btrim(coalesce(p_label, '')), '')
     where id = p_session_id and user_id = v_user;
  end if;

  if not found then
    raise exception 'Sortie introuvable' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enregistrement des points GPS
-- ---------------------------------------------------------------------------

create or replace function public.append_gps_points(
  p_session_id uuid,
  p_points     jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := app.require_user();
  v_status   session_status;
  v_inserted integer;
begin
  select status into v_status
    from public.sessions
   where id = p_session_id and user_id = v_user and deleted_at is null;

  if v_status is null then
    raise exception 'Sortie introuvable' using errcode = 'P0002';
  end if;

  -- ON CONFLICT DO NOTHING : renvoyer deux fois le même lot après une coupure
  -- réseau ne doit jamais dupliquer un point.
  with incoming as (
    select *
      from jsonb_to_recordset(coalesce(p_points, '[]'::jsonb)) as x(
        id                  uuid,
        lat                 double precision,
        lon                 double precision,
        recorded_at         timestamptz,
        accuracy_m          real,
        altitude_m          real,
        altitude_accuracy_m real,
        speed_ms            real,
        heading_deg         real,
        is_reliable         boolean
      )
  ),
  inserted as (
    insert into public.gps_points (
      id, session_id, user_id, position, recorded_at,
      accuracy_m, altitude_m, altitude_accuracy_m, speed_ms, heading_deg, is_reliable
    )
    select
      coalesce(i.id, gen_random_uuid()),
      p_session_id,
      v_user,
      st_setsrid(st_makepoint(i.lon, i.lat), 4326)::geography,
      i.recorded_at,
      i.accuracy_m,
      i.altitude_m,
      i.altitude_accuracy_m,
      i.speed_ms,
      -- Un cap hors bornes est ignoré plutôt que de faire échouer tout le lot.
      case when i.heading_deg >= 0 and i.heading_deg < 360 then i.heading_deg end,
      coalesce(i.is_reliable, true)
      from incoming i
     where i.lat is not null and i.lon is not null and i.recorded_at is not null
       and i.lat between -90 and 90
       and i.lon between -180 and 180
    on conflict (id) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from inserted;

  -- La trace est reconstruite dès qu'un point entre, y compris pour une sortie
  -- déjà terminée (synchronisation différée). `distance_m` reste ainsi toujours
  -- exacte, sans que le client ait à la recalculer ni à la deviner.
  if v_inserted > 0 then
    perform public.rebuild_track(p_session_id);
  end if;

  return v_inserted;
end;
$$;

comment on function public.append_gps_points is
  'Ajoute un lot de points GPS. Idempotent : les identifiants viennent du client.';

-- ---------------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------------

create or replace view public.session_overview
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  s.status,
  s.started_at,
  s.ended_at,
  s.paused_seconds,
  s.paused_at,
  s.title,
  s.notes,
  s.detector_id,
  s.sweep_width_m,
  s.start_lat,
  s.start_lon,
  s.vehicle_lat,
  s.vehicle_lon,
  s.vehicle_label,
  s.created_at,
  s.updated_at,
  coalesce(t.distance_m, 0)::numeric(12, 2) as distance_m,
  coalesce(t.point_count, 0)                as point_count,
  greatest(
    0,
    floor(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)))::bigint
  ) as elapsed_seconds,
  greatest(
    0,
    floor(extract(epoch from (coalesce(s.ended_at, now()) - s.started_at)))::bigint
      - s.paused_seconds
      - case when s.paused_at is null then 0
             else floor(extract(epoch from (now() - s.paused_at)))::bigint end
  ) as active_seconds,
  d.brand as detector_brand,
  d.model as detector_model
from public.sessions s
left join public.tracks t    on t.session_id = s.id
left join public.detectors d on d.id = s.detector_id
where s.deleted_at is null;

comment on view public.session_overview is
  'Sorties enrichies de la distance, du nombre de points et des durées calculées.';

-- Traces visibles dans une emprise, pour l'historique des passages.
create or replace function public.tracks_in_bbox(
  p_west  double precision,
  p_south double precision,
  p_east  double precision,
  p_north double precision,
  p_from  timestamptz default null,
  p_to    timestamptz default null,
  p_limit integer default 200
)
returns jsonb
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(feature), '[]'::jsonb)
  )
  from (
    select jsonb_build_object(
             'type', 'Feature',
             'id', t.session_id,
             'geometry', st_asgeojson(t.simplified)::jsonb,
             'properties', jsonb_build_object(
               'sessionId', t.session_id,
               'title', s.title,
               'startedAt', s.started_at,
               'distanceM', t.distance_m,
               'sweepWidthM', s.sweep_width_m
             )
           ) as feature
      from public.tracks t
      join public.sessions s on s.id = t.session_id
     where t.user_id = (select auth.uid())
       and s.deleted_at is null
       and t.simplified is not null
       and st_intersects(
             t.simplified,
             st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography
           )
       and (p_from is null or s.started_at >= p_from)
       and (p_to is null or s.started_at < p_to)
     order by s.started_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) as visible;
$$;

comment on function public.tracks_in_bbox is
  'Traces simplifiées intersectant une emprise, pour l''historique des passages.';

grant select on public.session_overview to authenticated;
grant execute on function public.rebuild_track(uuid) to authenticated;
grant execute on function public.start_session(double precision, double precision, numeric, uuid, text, boolean) to authenticated;
grant execute on function public.pause_session(uuid) to authenticated;
grant execute on function public.resume_session(uuid) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;
grant execute on function public.set_vehicle_point(uuid, double precision, double precision, text) to authenticated;
grant execute on function public.append_gps_points(uuid, jsonb) to authenticated;
grant execute on function public.tracks_in_bbox(double precision, double precision, double precision, double precision, timestamptz, timestamptz, integer) to authenticated;
