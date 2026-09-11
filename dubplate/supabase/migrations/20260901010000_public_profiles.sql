-- ============================================================================
-- Public artist pages: /u/<name>-<short id>
--
-- A profile gets the same URL shape as a track — a readable slug plus an
-- unguessable short id that the lookup actually uses, so renaming yourself
-- never breaks a link that is already out there.
-- ============================================================================

-- Slug helper. No unaccent extension required: the common Latin accents are
-- folded by hand, everything else that is not [a-z0-9] becomes a separator.
create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from
        regexp_replace(
          lower(translate(
            coalesce(input, ''),
            'àáâãäåÀÁÂÃÄÅèéêëÈÉÊËìíîïÌÍÎÏòóôõöøÒÓÔÕÖØùúûüÙÚÛÜçÇñÑýÿÝ',
            'aaaaaaAAAAAAeeeeEEEEiiiiIIIIooooooOOOOOOuuuuUUUUcCnNyyY'
          )),
          '[^a-z0-9]+', '-', 'g'
        )
      ),
      ''
    ),
    'artist'
  );
$$;

-- A volatile default makes PostgreSQL evaluate it per existing row, so the
-- back-fill is unique without a second statement.
alter table public.profiles
  add column if not exists short_id text not null default public.gen_short_id(),
  add column if not exists slug     text not null default 'artist';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_short_id_key'
  ) then
    alter table public.profiles add constraint profiles_short_id_key unique (short_id);
  end if;
end
$$;

update public.profiles set slug = public.slugify(display_name) where slug = 'artist';

create index if not exists profiles_short_id_idx on public.profiles (short_id);

-- Keep the slug in step with the name, always.
create or replace function public.sync_profile_slug()
returns trigger
language plpgsql
as $$
begin
  new.slug = public.slugify(new.display_name);
  return new;
end;
$$;

drop trigger if exists profiles_sync_slug on public.profiles;
create trigger profiles_sync_slug
  before insert or update of display_name on public.profiles
  for each row execute function public.sync_profile_slug();
