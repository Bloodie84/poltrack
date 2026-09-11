-- ============================================================================
-- Two holes closed, both found by reviewing the app as an attacker would.
--
-- 1. `unlisted` was readable by anyone through the Data API. The application
--    filtered its own listings on `visibility = 'public'`, but the application
--    is not the only reader: the anon key ships in every browser and PostgREST
--    exposes this schema. `?visibility=eq.unlisted` returned the lot — every
--    secret link on the platform, plus each track's storage path and owner.
--    Reproduced as `anon` against a real database before this change.
--
-- 2. A track row could point at somebody else's audio. RLS constrained
--    `owner_id` and nothing else, so any signed-in user — including a guest
--    created by an anonymous sign-in — could insert a row whose `audio_path`
--    was another user's object, then ask /api/download for it. That route
--    signs with the service role, which bypasses the storage owner policy.
--
-- The fix for the first is to stop bulk-reading unlisted rows at all and serve
-- them only through a function that takes the secret id as an argument, so
-- possession of the link is required per lookup and enumeration is impossible.
-- The fix for the second is to make the database refuse a path the owner does
-- not own, rather than trusting a route handler to have checked.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Listings return public rows only
-- ---------------------------------------------------------------------------
drop policy if exists "read visible tracks" on public.tracks;
drop policy if exists "read public or own tracks" on public.tracks;

create policy "read public or own tracks" on public.tracks
  for select using (
    visibility = 'public' or owner_id = (select auth.uid())
  );

drop policy if exists "read files of visible tracks" on public.track_files;
drop policy if exists "read files of public or own tracks" on public.track_files;

create policy "read files of public or own tracks" on public.track_files
  for select using (
    exists (
      select 1 from public.tracks t
      where t.id = track_files.track_id
        and (t.visibility = 'public' or t.owner_id = (select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- 2. A shared link resolves one track, by its secret id
--
-- SECURITY DEFINER so it can see past the policy above, but it takes the
-- 12-hex `short_id` as an argument and returns at most one row: there is no
-- way to ask it for "everything". `audio_path` is deliberately not returned —
-- the listening page has no use for it.
-- ---------------------------------------------------------------------------
create or replace function public.track_by_short_id(p_short_id text)
returns table (
  id                uuid,
  owner_id          uuid,
  short_id          text,
  slug              text,
  title             text,
  artist            text,
  description       text,
  genre             text,
  cover_url         text,
  duration          double precision,
  visibility        public.track_visibility,
  downloads_enabled boolean,
  play_count        integer,
  created_at        timestamptz,
  format            text,
  bitrate           integer,
  sample_rate       integer,
  waveform          jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.owner_id, t.short_id, t.slug, t.title, t.artist, t.description,
         t.genre, t.cover_url, t.duration, t.visibility, t.downloads_enabled,
         t.play_count, t.created_at,
         f.format, f.bitrate, f.sample_rate, f.waveform
  from public.tracks t
  left join public.track_files f on f.track_id = t.id
  where t.short_id = p_short_id
    and (t.visibility <> 'private' or t.owner_id = (select auth.uid()))
  limit 1;
$$;

grant execute on function public.track_by_short_id(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A row cannot claim a file its owner does not own
--
-- Added NOT VALID: rows written before this migration all went through the
-- route handler, which already forced the prefix, but a deployment should not
-- fail on legacy data. New and updated rows are checked either way.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tracks_audio_path_owned') then
    alter table public.tracks
      add constraint tracks_audio_path_owned
      check (audio_path like owner_id::text || '/%') not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tracks_cover_path_owned') then
    alter table public.tracks
      add constraint tracks_cover_path_owned
      check (cover_path is null or cover_path like owner_id::text || '/%') not valid;
  end if;
end
$$;
