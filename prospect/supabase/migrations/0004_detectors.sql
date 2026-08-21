-- 0004 — Détecteurs et configurations (préréglages).
--
-- Une sortie (phase 2) et une découverte (phase 3) référenceront un détecteur
-- et, optionnellement, le préréglage utilisé au moment précis de la trouvaille.

create table if not exists public.detectors (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  brand          text not null check (char_length(brand) between 1 and 60),
  model          text not null check (char_length(model) between 1 and 60),
  coil           text check (coil is null or char_length(coil) <= 60),
  frequency_khz  numeric(6, 2) check (frequency_khz is null or frequency_khz > 0),
  notes          text check (notes is null or char_length(notes) <= 2000),
  is_default     boolean not null default false,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.detectors is 'Matériel de l''utilisateur.';
comment on column public.detectors.deleted_at is
  'Suppression logique : les sorties/découvertes historiques gardent leur référence.';

create index if not exists detectors_user_idx
  on public.detectors (user_id) where deleted_at is null;

-- Un seul détecteur par défaut par utilisateur.
create unique index if not exists detectors_one_default_per_user
  on public.detectors (user_id)
  where is_default and deleted_at is null;

select app.attach_updated_at('public.detectors');

-- ---------------------------------------------------------------------------

create table if not exists public.detector_presets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  detector_id     uuid not null references public.detectors (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  program         text check (program is null or char_length(program) <= 60),
  sensitivity     integer check (sensitivity is null or sensitivity between 0 and 100),
  discrimination  integer check (discrimination is null or discrimination between 0 and 100),
  ground_balance  text check (ground_balance is null or char_length(ground_balance) <= 60),
  iron_volume     integer check (iron_volume is null or iron_volume between 0 and 100),
  -- Paramètres spécifiques à une marque : conservés tels quels, sans perte.
  extra           jsonb not null default '{}'::jsonb,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.detector_presets is
  'Réglages nommés d''un détecteur (programme, sensibilité, discrimination…).';

create index if not exists detector_presets_detector_idx
  on public.detector_presets (detector_id) where deleted_at is null;

create unique index if not exists detector_presets_one_default_per_detector
  on public.detector_presets (detector_id)
  where is_default and deleted_at is null;

select app.attach_updated_at('public.detector_presets');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.detectors        enable row level security;
alter table public.detector_presets enable row level security;

drop policy if exists detectors_all_own on public.detectors;
create policy detectors_all_own on public.detectors
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists detector_presets_all_own on public.detector_presets;
create policy detector_presets_all_own on public.detector_presets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.detectors        to authenticated;
grant select, insert, update, delete on public.detector_presets to authenticated;
