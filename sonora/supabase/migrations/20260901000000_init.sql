-- ============================================================================
-- Sonora — initial schema
-- Tables: profiles, tracks, track_files, plays, downloads
-- Everything is protected by Row Level Security. The anon/authenticated keys
-- can never read a private track or write a play row directly.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 12 hex chars -> 2^48 values. Used as the public, unguessable part of a URL.
create or replace function public.gen_short_id()
returns text
language sql
volatile
as $$
  select encode(gen_random_bytes(6), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Artist',
  bio          text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 60)
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile row automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1),
      'Artist'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tracks
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'track_visibility') then
    create type public.track_visibility as enum ('public', 'unlisted', 'private');
  end if;
end
$$;

create table if not exists public.tracks (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  short_id          text not null unique default public.gen_short_id(),
  slug              text not null default 'track',
  title             text not null,
  artist            text not null,
  description       text,
  genre             text,
  cover_url         text,
  cover_path        text,
  audio_path        text not null,
  duration          double precision not null default 0,
  visibility        public.track_visibility not null default 'public',
  downloads_enabled boolean not null default false,
  play_count        integer not null default 0,
  download_count    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint tracks_title_len       check (char_length(title) between 1 and 120),
  constraint tracks_artist_len      check (char_length(artist) between 1 and 80),
  constraint tracks_description_len check (description is null or char_length(description) <= 2000),
  constraint tracks_genre_len       check (genre is null or char_length(genre) <= 40),
  constraint tracks_duration_pos    check (duration >= 0)
);

create index if not exists tracks_owner_created_idx  on public.tracks (owner_id, created_at desc);
create index if not exists tracks_public_created_idx on public.tracks (created_at desc) where visibility = 'public';
create index if not exists tracks_short_id_idx       on public.tracks (short_id);

drop trigger if exists tracks_set_updated_at on public.tracks;
create trigger tracks_set_updated_at
  before update on public.tracks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- track_files — technical metadata of the original uploaded file
-- ---------------------------------------------------------------------------
create table if not exists public.track_files (
  id                uuid primary key default gen_random_uuid(),
  track_id          uuid not null unique references public.tracks (id) on delete cascade,
  storage_path      text not null,
  original_filename text not null,
  mime_type         text not null,
  format            text,
  byte_size         bigint not null default 0,
  duration          double precision,
  bitrate           integer,
  sample_rate       integer,
  channels          integer,
  waveform          jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists track_files_track_idx on public.track_files (track_id);

-- ---------------------------------------------------------------------------
-- plays / downloads — written server-side only (service role)
-- ---------------------------------------------------------------------------
create table if not exists public.plays (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.tracks (id) on delete cascade,
  listener_hash text not null,
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists plays_track_created_idx  on public.plays (track_id, created_at desc);
create index if not exists plays_track_listener_idx on public.plays (track_id, listener_hash);

create table if not exists public.downloads (
  id            uuid primary key default gen_random_uuid(),
  track_id      uuid not null references public.tracks (id) on delete cascade,
  listener_hash text not null,
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists downloads_track_created_idx on public.downloads (track_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.tracks      enable row level security;
alter table public.track_files enable row level security;
alter table public.plays       enable row level security;
alter table public.downloads   enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles are readable"        on public.profiles;
drop policy if exists "insert own profile"           on public.profiles;
drop policy if exists "update own profile"           on public.profiles;

create policy "profiles are readable" on public.profiles
  for select using (true);

create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- tracks --------------------------------------------------------------------
-- A private track is invisible to everyone but its owner. An unlisted track is
-- readable (it has to be, to serve a shared link) but the application never
-- lists it publicly: public listings filter on visibility = 'public'.
drop policy if exists "read visible tracks" on public.tracks;
drop policy if exists "insert own tracks"   on public.tracks;
drop policy if exists "update own tracks"   on public.tracks;
drop policy if exists "delete own tracks"   on public.tracks;

create policy "read visible tracks" on public.tracks
  for select using (
    visibility in ('public', 'unlisted') or owner_id = (select auth.uid())
  );

create policy "insert own tracks" on public.tracks
  for insert with check (owner_id = (select auth.uid()));

create policy "update own tracks" on public.tracks
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "delete own tracks" on public.tracks
  for delete using (owner_id = (select auth.uid()));

-- track_files ---------------------------------------------------------------
drop policy if exists "read files of visible tracks" on public.track_files;
drop policy if exists "write files of own tracks"    on public.track_files;
drop policy if exists "update files of own tracks"   on public.track_files;
drop policy if exists "delete files of own tracks"   on public.track_files;

create policy "read files of visible tracks" on public.track_files
  for select using (
    exists (
      select 1 from public.tracks t
      where t.id = track_files.track_id
        and (t.visibility in ('public', 'unlisted') or t.owner_id = (select auth.uid()))
    )
  );

create policy "write files of own tracks" on public.track_files
  for insert with check (
    exists (select 1 from public.tracks t
            where t.id = track_files.track_id and t.owner_id = (select auth.uid()))
  );

create policy "update files of own tracks" on public.track_files
  for update using (
    exists (select 1 from public.tracks t
            where t.id = track_files.track_id and t.owner_id = (select auth.uid()))
  );

create policy "delete files of own tracks" on public.track_files
  for delete using (
    exists (select 1 from public.tracks t
            where t.id = track_files.track_id and t.owner_id = (select auth.uid()))
  );

-- plays / downloads ---------------------------------------------------------
-- Read-only for the track owner (their statistics). No insert policy at all:
-- rows are written exclusively by the server with the service role key, so a
-- client cannot inflate its own counters.
drop policy if exists "owner reads plays"     on public.plays;
drop policy if exists "owner reads downloads" on public.downloads;

create policy "owner reads plays" on public.plays
  for select using (
    exists (select 1 from public.tracks t
            where t.id = plays.track_id and t.owner_id = (select auth.uid()))
  );

create policy "owner reads downloads" on public.downloads
  for select using (
    exists (select 1 from public.tracks t
            where t.id = downloads.track_id and t.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Counter helpers (called with the service role from API routes)
-- ---------------------------------------------------------------------------
create or replace function public.increment_play(p_track_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracks set play_count = play_count + 1 where id = p_track_id;
$$;

create or replace function public.increment_download(p_track_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tracks set download_count = download_count + 1 where id = p_track_id;
$$;

-- `public` holds EXECUTE by default, so it has to be revoked as well: only the
-- service role (used by the API routes) may move a counter.
revoke execute on function public.increment_play(uuid)     from public, anon, authenticated;
revoke execute on function public.increment_download(uuid) from public, anon, authenticated;
grant  execute on function public.increment_play(uuid)     to service_role;
grant  execute on function public.increment_download(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio', 'audio', false, 524288000,
  array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/wave','audio/flac',
        'audio/x-flac','audio/mp4','audio/x-m4a','audio/m4a','audio/aac','application/octet-stream']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers', 'covers', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Audio objects live under <user_id>/<track_id>/<filename>. Nobody can read
-- them with the anon key; playback and download go through server routes that
-- check permissions and mint a short-lived signed URL.
drop policy if exists "audio owner insert" on storage.objects;
drop policy if exists "audio owner update" on storage.objects;
drop policy if exists "audio owner delete" on storage.objects;
drop policy if exists "audio owner read"   on storage.objects;

create policy "audio owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "audio owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "audio owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "audio owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "covers public read"  on storage.objects;
drop policy if exists "covers owner insert" on storage.objects;
drop policy if exists "covers owner update" on storage.objects;
drop policy if exists "covers owner delete" on storage.objects;

create policy "covers public read" on storage.objects
  for select using (bucket_id = 'covers');

create policy "covers owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "covers owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
