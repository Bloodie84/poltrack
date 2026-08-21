-- 0010 — Lectures cartographiques d'une sortie.
--
-- La trace complète (non simplifiée) n'est chargée que pour une sortie précise :
-- l'historique général passe par `tracks_in_bbox`, qui sert la version allégée.

create or replace function public.session_geojson(p_session_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(
      jsonb_agg(feature) filter (where feature is not null),
      '[]'::jsonb
    )
  )
  from (
    select jsonb_build_object(
             'type', 'Feature',
             'id', 'track',
             'geometry', st_asgeojson(t.line)::jsonb,
             'properties', jsonb_build_object('kind', 'track', 'distanceM', t.distance_m)
           ) as feature
      from public.tracks t
      join public.sessions s on s.id = t.session_id
     where t.session_id = p_session_id
       and t.user_id = (select auth.uid())
       and s.deleted_at is null
       and t.line is not null

    union all

    select jsonb_build_object(
             'type', 'Feature',
             'id', 'start',
             'geometry', st_asgeojson(s.start_point)::jsonb,
             'properties', jsonb_build_object('kind', 'start')
           )
      from public.sessions s
     where s.id = p_session_id
       and s.user_id = (select auth.uid())
       and s.deleted_at is null
       and s.start_point is not null

    union all

    select jsonb_build_object(
             'type', 'Feature',
             'id', 'vehicle',
             'geometry', st_asgeojson(s.vehicle_point)::jsonb,
             'properties', jsonb_build_object('kind', 'vehicle', 'label', s.vehicle_label)
           )
      from public.sessions s
     where s.id = p_session_id
       and s.user_id = (select auth.uid())
       and s.deleted_at is null
       and s.vehicle_point is not null
  ) as parts;
$$;

comment on function public.session_geojson is
  'Trace complète, point de départ et point de retour d''une sortie, en GeoJSON.';

grant execute on function public.session_geojson(uuid) to authenticated;
