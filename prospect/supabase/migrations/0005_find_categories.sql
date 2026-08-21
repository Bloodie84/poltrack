-- 0005 — Catégories de découvertes.
--
-- Deux origines cohabitent :
--   * les catégories système (user_id IS NULL), visibles par tous, non modifiables ;
--   * les catégories personnelles (user_id = propriétaire), librement gérées.

create table if not exists public.find_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9_-]{2,40}$'),
  label       text not null check (char_length(label) between 1 and 60),
  color       text not null default '#8b8b8b' check (color ~* '^#[0-9a-f]{6}$'),
  icon        text check (icon is null or char_length(icon) <= 40),
  -- Sert au ratio déchets / trouvailles du tableau de bord (phase 7).
  is_waste    boolean not null default false,
  is_system   boolean not null default false,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint find_categories_system_has_no_owner
    check ((is_system and user_id is null) or (not is_system and user_id is not null))
);

comment on table public.find_categories is
  'Catégories de trouvailles : système (partagées) ou personnelles.';

create unique index if not exists find_categories_system_slug_uidx
  on public.find_categories (slug) where user_id is null;

create unique index if not exists find_categories_user_slug_uidx
  on public.find_categories (user_id, slug) where user_id is not null;

create index if not exists find_categories_user_idx
  on public.find_categories (user_id) where deleted_at is null;

select app.attach_updated_at('public.find_categories');

-- ---------------------------------------------------------------------------
-- Jeu par défaut
-- ---------------------------------------------------------------------------

insert into public.find_categories (slug, label, color, is_waste, is_system, sort_order)
values
  ('monnaie',        'Monnaie',         '#d4a017', false, true, 10),
  ('bague',          'Bague',           '#e0b0ff', false, true, 20),
  ('bijou',          'Bijou',           '#c77dff', false, true, 30),
  ('bouton',         'Bouton',          '#b08968', false, true, 40),
  ('medaille',       'Médaille',        '#e6c229', false, true, 50),
  ('boucle',         'Boucle',          '#9c6644', false, true, 60),
  ('plomb',          'Plomb',           '#8d99ae', false, true, 70),
  ('militaire',      'Objet militaire', '#6b705c', false, true, 80),
  ('objet-ancien',   'Objet ancien',    '#a68a64', false, true, 90),
  ('objet-moderne',  'Objet moderne',   '#7f8c8d', false, true, 100),
  ('fer',            'Fer',             '#6c757d', false, true, 110),
  ('bronze',         'Bronze',          '#cd7f32', false, true, 120),
  ('cuivre',         'Cuivre',          '#b87333', false, true, 130),
  ('argent',         'Argent',          '#c0c0c0', false, true, 140),
  ('or',             'Or',              '#ffd700', false, true, 150),
  ('dechet',         'Déchet',          '#57534e', true,  true, 160),
  ('indetermine',    'Indéterminé',     '#94a3b8', false, true, 170),
  ('autre',          'Autre',           '#64748b', false, true, 180)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.find_categories enable row level security;

drop policy if exists find_categories_select on public.find_categories;
create policy find_categories_select on public.find_categories
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

drop policy if exists find_categories_insert_own on public.find_categories;
create policy find_categories_insert_own on public.find_categories
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not is_system);

drop policy if exists find_categories_update_own on public.find_categories;
create policy find_categories_update_own on public.find_categories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and not is_system);

drop policy if exists find_categories_delete_own on public.find_categories;
create policy find_categories_delete_own on public.find_categories
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.find_categories to authenticated;
