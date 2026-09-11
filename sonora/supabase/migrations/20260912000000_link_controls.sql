-- ============================================================================
-- Link controls: a shared link can be locked behind a password, and it can be
-- given a date after which it stops working.
--
-- These are properties of the link, not a fourth visibility. PRIVATE is still
-- the only thing that means "nobody but me", and nothing here weakens it. A
-- locked or expired track simply stops being readable by anyone who is not its
-- owner — including through the Data API, including in listings — and the
-- password is checked inside the database so the hash never leaves it.
-- ============================================================================

alter table public.tracks add column if not exists password_hash text;
alter table public.tracks add column if not exists expires_at    timestamptz;

-- Whether there is a lock, as a column, so nothing in the application ever has
-- a reason to select the hash: the dashboard, the edit screen and the access
-- check all read this instead. RLS already confines `tracks` to rows the caller
-- owns or may see, so the hash is never another person's to read; this is what
-- keeps it from travelling at all.
alter table public.tracks
  add column if not exists has_password boolean
  generated always as (password_hash is not null) stored;

-- ---------------------------------------------------------------------------
-- 1. A locked or expired track leaves the public listings
--
-- Otherwise a "public" track with a password would still be readable in bulk
-- with the anon key — title, artist, waveform and all — which would make the
-- lock decorative. Dropping it from the policy is what makes the link the only
-- way in, which is the same reasoning that moved unlisted tracks behind
-- `track_by_short_id`.
-- ---------------------------------------------------------------------------
create or replace function public.track_is_open(
  p_password_hash text,
  p_expires_at timestamptz
) returns boolean
language sql
immutable
as $$
  select p_password_hash is null and (p_expires_at is null or p_expires_at > now());
$$;

drop policy if exists "read public or own tracks" on public.tracks;
create policy "read public or own tracks" on public.tracks
  for select using (
    owner_id = (select auth.uid())
    or (visibility = 'public' and public.track_is_open(password_hash, expires_at))
  );

drop policy if exists "read files of public or own tracks" on public.track_files;
create policy "read files of public or own tracks" on public.track_files
  for select using (
    exists (
      select 1 from public.tracks t
      where t.id = track_files.track_id
        and (
          t.owner_id = (select auth.uid())
          or (t.visibility = 'public' and public.track_is_open(t.password_hash, t.expires_at))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. The link lookup refuses a locked or expired track
--
-- The page then asks `track_gate` which screen to show. Unlocking happens
-- server-side and the row is loaded with the service role afterwards, so there
-- is no path by which this function hands out a locked track.
-- ---------------------------------------------------------------------------
drop function if exists public.track_by_short_id(text);
create or replace function public.track_by_short_id(p_short_id text)
returns table (
  id uuid,
  owner_id uuid,
  short_id text,
  slug text,
  title text,
  artist text,
  description text,
  genre text,
  cover_url text,
  duration double precision,
  visibility public.track_visibility,
  downloads_enabled boolean,
  play_count integer,
  created_at timestamptz,
  format text,
  bitrate integer,
  sample_rate integer,
  waveform jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.owner_id, t.short_id, t.slug, t.title, t.artist, t.description, t.genre,
         t.cover_url, t.duration, t.visibility, t.downloads_enabled, t.play_count, t.created_at,
         f.format, f.bitrate, f.sample_rate, f.waveform
    from public.tracks t
    left join public.track_files f on f.track_id = t.id
   where t.short_id = p_short_id
     and (
       t.owner_id = (select auth.uid())
       or (t.visibility <> 'private' and public.track_is_open(t.password_hash, t.expires_at))
     )
   limit 1;
$$;

revoke execute on function public.track_by_short_id(text) from public;
grant execute on function public.track_by_short_id(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Which screen to show for a link that did not open
--
-- Says only whether a short id exists and what is standing in the way. The
-- holder of the link already knows the id, so this adds nothing they could not
-- work out from the page itself — and it deliberately carries no title, no
-- artist and no hash.
-- ---------------------------------------------------------------------------
create or replace function public.track_gate(p_short_id text)
returns table (expired boolean, protected boolean)
language sql
stable
security definer
set search_path = public
as $$
  select (t.expires_at is not null and t.expires_at <= now()),
         (t.password_hash is not null)
    from public.tracks t
   where t.short_id = p_short_id
     and t.visibility <> 'private'
   limit 1;
$$;

revoke execute on function public.track_gate(text) from public;
grant execute on function public.track_gate(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Checking a password
--
-- bcrypt, compared inside the database: the hash is never selected by a route
-- handler, so it cannot be leaked by one. Returns the track id on success and
-- nothing at all otherwise — no distinction between a wrong password, an
-- expired link and a short id that was never real.
-- ---------------------------------------------------------------------------
create or replace function public.track_unlock(p_short_id text, p_password text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select t.id
    from public.tracks t
   where t.short_id = p_short_id
     and t.visibility <> 'private'
     and t.password_hash is not null
     and (t.expires_at is null or t.expires_at > now())
     and t.password_hash = crypt(p_password, t.password_hash)
   limit 1;
$$;

revoke execute on function public.track_unlock(text, text) from public;
grant execute on function public.track_unlock(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Setting a password
--
-- Also inside the database, for the same reason: the plain password arrives,
-- is hashed here and is never stored anywhere else. Ownership is checked
-- against auth.uid() rather than trusted from the caller.
-- ---------------------------------------------------------------------------
create or replace function public.set_track_password(p_track_id uuid, p_password text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.tracks where id = p_track_id;
  if v_owner is null or v_owner <> (select auth.uid()) then
    return false;
  end if;

  if p_password is null or length(p_password) = 0 then
    update public.tracks set password_hash = null where id = p_track_id;
  elsif length(p_password) < 6 then
    raise exception 'A link password must be at least 6 characters.';
  else
    -- Cost 10, not pgcrypto's default of 6. The default is about a millisecond
    -- a guess, which is no obstacle at all to somebody working through a word
    -- list against the unlock endpoint; this is roughly sixty times slower.
    update public.tracks
       set password_hash = crypt(p_password, gen_salt('bf', 10))
     where id = p_track_id;
  end if;

  return true;
end;
$$;

revoke execute on function public.set_track_password(uuid, text) from public, anon;
grant execute on function public.set_track_password(uuid, text) to authenticated;
