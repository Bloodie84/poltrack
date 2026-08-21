-- 0001 — Extensions, schéma utilitaire et helpers communs.
--
-- Ce fichier ne crée aucune table métier : uniquement les fondations
-- réutilisées par toutes les migrations suivantes.

create extension if not exists postgis;

-- Schéma technique : fonctions internes, jamais exposé via PostgREST.
create schema if not exists app;

comment on schema app is
  'Fonctions et helpers internes de Prospect. Non exposé à l''API.';

-- ---------------------------------------------------------------------------
-- Types partagés
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'privacy_level') then
    create type privacy_level as enum ('private', 'friends', 'shared');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'unit_system') then
    create type unit_system as enum ('metric', 'imperial');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'Trigger BEFORE UPDATE : maintient updated_at à jour.';

-- Attache le trigger updated_at à une table (idempotent).
create or replace function app.attach_updated_at(p_table regclass)
returns void
language plpgsql
as $$
declare
  v_name text := 'set_updated_at_' || replace(p_table::text, '.', '_');
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before update on %s for each row execute function app.set_updated_at()',
    v_name, p_table
  );
end;
$$;
