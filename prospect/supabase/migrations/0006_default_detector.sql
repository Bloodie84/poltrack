-- 0006 — Changement de détecteur par défaut.
--
-- L'index unique partiel `detectors_one_default_per_user` interdit deux valeurs
-- par défaut : le basculement doit donc se faire en une seule transaction.

create or replace function public.set_default_detector(p_detector_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Non authentifié' using errcode = '28000';
  end if;

  -- La RLS restreint déjà aux lignes de l'utilisateur ; le filtre explicite
  -- garde la fonction correcte même si elle est appelée hors RLS.
  update public.detectors
     set is_default = false
   where user_id = v_user and is_default and id is distinct from p_detector_id;

  update public.detectors
     set is_default = true
   where id = p_detector_id and user_id = v_user and deleted_at is null;

  if not found then
    raise exception 'Détecteur introuvable' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.set_default_detector is
  'Bascule le détecteur par défaut de façon atomique.';

grant execute on function public.set_default_detector(uuid) to authenticated;
