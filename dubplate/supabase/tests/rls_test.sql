-- ===========================================================================
-- Security assertions for the Dubplate schema.
-- Every check raises an exception if the policy does not behave as intended.
-- ===========================================================================
\set ON_ERROR_STOP on

create or replace function public.assert(condition boolean, label text)
returns void
language plpgsql
as $$
begin
  if condition then
    raise notice 'ok   %', label;
  else
    raise exception 'FAIL %', label;
  end if;
end;
$$;

-- Two users -----------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',   '{}');

select public.assert(
  (select count(*) from public.profiles) = 2,
  'signup trigger creates one profile per user'
);
select public.assert(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice',
  'profile takes display_name from signup metadata'
);
select public.assert(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'bob',
  'profile falls back to the e-mail local part'
);

-- Alice publishes three tracks with different visibilities -------------------
insert into public.tracks (id, owner_id, title, artist, slug, audio_path, visibility, downloads_enabled)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Public one', 'Alice', 'public-one', '11111111-1111-1111-1111-111111111111/a/one.mp3', 'public', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Unlisted one', 'Alice', 'unlisted-one', '11111111-1111-1111-1111-111111111111/b/two.mp3', 'unlisted', false),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Private one', 'Alice', 'private-one', '11111111-1111-1111-1111-111111111111/c/three.mp3', 'private', true);

select public.assert(
  (select count(distinct short_id) from public.tracks) = 3,
  'every track gets a distinct short id'
);

-- Captured now, as superuser: from here on the roles under test are not
-- supposed to be able to discover these, which is the whole point.
select short_id as unlisted_link from public.tracks where title = 'Unlisted one' \gset
select short_id as private_link  from public.tracks where title = 'Private one'  \gset

insert into public.track_files (track_id, storage_path, original_filename, mime_type, byte_size)
values ('aaaaaaaa-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111/c/three.mp3', 'three.mp3', 'audio/mpeg', 1234);

-- Anonymous visitor ---------------------------------------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false);

-- A bulk read must return public rows only. Returning unlisted ones here is
-- what made every shared link enumerable through the Data API, since the anon
-- key ships in the browser.
select public.assert(
  (select count(*) from public.tracks) = 1,
  'anonymous listing returns public tracks only'
);
select public.assert(
  (select count(*) from public.tracks where visibility = 'unlisted') = 0,
  'anonymous cannot enumerate unlisted tracks'
);
select public.assert(
  (select count(*) from public.tracks where visibility = 'private') = 0,
  'anonymous cannot read a private track'
);
select public.assert(
  (select count(*) from public.tracks where visibility = 'public') = 1,
  'public listing returns only public tracks'
);
select public.assert(
  (select count(*) from public.track_files) = 0,
  'anonymous cannot read the file row of a private track'
);

-- The link itself is the capability: handing the secret id to the function
-- returns exactly one row, and nothing else can be asked of it.
select public.assert(
  (select count(*) from public.track_by_short_id(:'unlisted_link')) = 1,
  'an unlisted track opens for whoever holds its link'
);
select public.assert(
  (select count(*) from public.track_by_short_id('ffffffffffff')) = 0,
  'an invented link resolves to nothing'
);
select public.assert(
  (select count(*) from public.track_by_short_id(:'private_link')) = 0,
  'a private track stays shut even to somebody holding its link'
);
select public.assert(
  (select count(*) from public.plays) = 0,
  'anonymous cannot read play rows'
);

-- Anonymous writes must all fail.
do $$
begin
  begin
    insert into public.plays (track_id, listener_hash)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'forged');
    raise exception 'FAIL anonymous could insert a play';
  exception when insufficient_privilege then
    raise notice 'ok   anonymous cannot forge a play';
  end;
end
$$;

do $$
begin
  begin
    update public.tracks set title = 'hacked'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    if found then raise exception 'FAIL anonymous could edit a track'; end if;
    raise notice 'ok   anonymous update affects no row';
  exception when insufficient_privilege then
    raise notice 'ok   anonymous cannot update a track';
  end;
end
$$;

-- Bob, signed in ------------------------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

select public.assert(
  (select count(*) from public.tracks) = 1,
  'another signed-in user sees only public tracks, not private or unlisted ones'
);

do $$
declare n integer;
begin
  update public.tracks set downloads_enabled = false
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform public.assert(n = 0, 'a user cannot flip downloads on someone else''s track');

  delete from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform public.assert(n = 0, 'a user cannot delete someone else''s track');
end
$$;

do $$
begin
  begin
    insert into public.tracks (owner_id, title, artist, audio_path)
    values ('11111111-1111-1111-1111-111111111111', 'Impersonation', 'Alice', 'x/y.mp3');
    raise exception 'FAIL a user could insert a track owned by someone else';
  exception when insufficient_privilege then
    raise notice 'ok   a user cannot insert a track owned by someone else';
  end;
end
$$;

select public.assert(
  (select count(*) from public.plays) = 0,
  'a user cannot read the statistics of someone else''s track'
);

-- Owning the row must not mean naming somebody else's file. Without this, a
-- user could point a track of their own at another account's master and have
-- the download route sign it with the service role.
do $$
begin
  begin
    insert into public.tracks (owner_id, title, artist, audio_path)
    values ('22222222-2222-2222-2222-222222222222', 'Forged', 'Me',
            '11111111-1111-1111-1111-111111111111/a/master.wav');
    raise exception 'FAIL a user could claim another account''s audio file';
  exception when check_violation then
    raise notice 'ok   a track cannot name a file outside its owner''s folder';
  end;
end
$$;

-- Alice, signed in ----------------------------------------------------------
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select public.assert(
  (select count(*) from public.tracks) = 3,
  'the owner sees all of their tracks, private included'
);
select public.assert(
  (select count(*) from public.track_files) = 1,
  'the owner reads the file row of their private track'
);

do $$
declare n integer;
begin
  update public.tracks set downloads_enabled = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  perform public.assert(n = 1, 'the owner can toggle downloads without republishing');

  update public.profiles set display_name = 'Alice B'
  where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  perform public.assert(n = 1, 'the owner can rename their profile');

  update public.profiles set display_name = 'nope'
  where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  perform public.assert(n = 0, 'a user cannot rename another profile');
end
$$;

-- Counter helpers are server-side only --------------------------------------
do $$
begin
  begin
    perform public.increment_play('aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'FAIL a signed-in user could call increment_play';
  exception when insufficient_privilege then
    raise notice 'ok   increment_play is not callable by anon/authenticated';
  end;
end
$$;

-- Service role (the API routes) --------------------------------------------
reset role;
set role service_role;

insert into public.plays (track_id, listener_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', 'hash-1');
insert into public.plays (track_id, listener_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', 'hash-2');
select public.increment_play('aaaaaaaa-0000-0000-0000-000000000001');
select public.increment_play('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.downloads (track_id, listener_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', 'hash-1');
select public.increment_download('aaaaaaaa-0000-0000-0000-000000000001');

select public.assert(
  (select play_count from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2,
  'the server can increment the play counter'
);
select public.assert(
  (select download_count from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
  'the server can increment the download counter'
);

-- Owner reads their own statistics ------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select public.assert(
  (select count(*) from public.plays where track_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2,
  'the owner reads the plays of their own track'
);
select public.assert(
  (select count(distinct listener_hash) from public.plays) = 2,
  'unique listeners are countable from the play rows'
);

-- Cascade -------------------------------------------------------------------
delete from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000003';
reset role;
select public.assert(
  (select count(*) from public.track_files
   where track_id = 'aaaaaaaa-0000-0000-0000-000000000003') = 0,
  'deleting a track removes its file row'
);

-- Storage buckets -----------------------------------------------------------
select public.assert(
  (select not public from storage.buckets where id = 'audio'),
  'the audio bucket is private'
);
select public.assert(
  (select public from storage.buckets where id = 'covers'),
  'the covers bucket is public'
);

-- ===========================================================================
-- Link controls: a password on a link, and a date it stops working
-- ===========================================================================
reset role;

insert into public.tracks (id, owner_id, title, artist, slug, audio_path, visibility, downloads_enabled)
values
  ('aaaaaaaa-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111',
   'Locked one', 'Alice', 'locked-one', '11111111-1111-1111-1111-111111111111/d/four.mp3', 'public', true),
  ('aaaaaaaa-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
   'Stale one', 'Alice', 'stale-one', '11111111-1111-1111-1111-111111111111/e/five.mp3', 'public', true);

-- The owner sets a password through the function, never by writing the column.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select public.assert(
  public.set_track_password('aaaaaaaa-0000-0000-0000-000000000010', 'correct-horse'),
  'the owner can lock their own link'
);

reset role;
select public.assert(
  (select has_password from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000010'),
  'has_password follows the hash'
);
select public.assert(
  (select password_hash from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000010')
    <> 'correct-horse',
  'the password is never stored in the clear'
);

update public.tracks set expires_at = now() - interval '1 hour'
 where id = 'aaaaaaaa-0000-0000-0000-000000000011';

-- The short ids, kept aside: a locked track leaves the listings, so anon can no
-- longer look one up — and an assertion that could not find the id would pass
-- for the wrong reason.
create temporary table link_ids as
select slug, short_id from public.tracks
 where slug in ('locked-one', 'stale-one', 'private-one');
grant select on link_ids to anon, authenticated;

-- Somebody else must not be able to lock a link that is not theirs -----------
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

select public.assert(
  not public.set_track_password('aaaaaaaa-0000-0000-0000-000000000010', 'let-me-in'),
  'a stranger cannot set the password on somebody else''s link'
);

-- Listings ------------------------------------------------------------------
reset role;
set role anon;

select public.assert(
  (select count(*) from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000010') = 0,
  'a locked track leaves the public listings'
);
select public.assert(
  (select count(*) from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000011') = 0,
  'an expired track leaves the public listings'
);
select public.assert(
  (select count(*) from public.track_files
    where track_id = 'aaaaaaaa-0000-0000-0000-000000000010') = 0,
  'the file row of a locked track goes with it'
);

-- The link lookup -----------------------------------------------------------
select public.assert(
  (select count(*) from public.track_by_short_id(
     (select short_id from link_ids where slug = 'locked-one'))) = 0,
  'the link lookup refuses a locked track'
);
select public.assert(
  (select count(*) from public.track_by_short_id(
     (select short_id from link_ids where slug = 'stale-one'))) = 0,
  'the link lookup refuses an expired track'
);

-- track_gate says which screen to show, and nothing more ---------------------
select public.assert(
  (select protected from public.track_gate(
     (select short_id from link_ids where slug = 'locked-one'))),
  'the gate reports a protected link'
);
select public.assert(
  (select expired from public.track_gate(
     (select short_id from link_ids where slug = 'stale-one'))),
  'the gate reports an expired link'
);
select public.assert(
  (select count(*) from public.track_gate(
     (select short_id from link_ids where slug = 'private-one'))) = 0,
  'the gate says nothing at all about a private track'
);

-- Unlocking -----------------------------------------------------------------
select public.assert(
  public.track_unlock(
    (select short_id from link_ids where slug = 'locked-one'), 'correct-horse') is not null,
  'the right password opens the link'
);
select public.assert(
  public.track_unlock(
    (select short_id from link_ids where slug = 'locked-one'), 'wrong') is null,
  'a wrong password does not'
);
select public.assert(
  public.track_unlock(
    (select short_id from link_ids where slug = 'stale-one'), 'anything') is null,
  'an expired link cannot be unlocked at all'
);

-- The owner still sees their own ---------------------------------------------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

select public.assert(
  (select count(*) from public.tracks where id in (
     'aaaaaaaa-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000011')) = 2,
  'the owner still sees their locked and expired tracks'
);
select public.assert(
  (select count(*) from public.track_by_short_id(
     (select short_id from link_ids where slug = 'locked-one'))) = 1,
  'and can still open their own locked link'
);

-- Clearing the password -------------------------------------------------------
select public.assert(
  public.set_track_password('aaaaaaaa-0000-0000-0000-000000000010', null),
  'the owner can remove the password'
);
reset role;
select public.assert(
  not (select has_password from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000010'),
  'and the track is open again'
);

set role anon;
select public.assert(
  (select count(*) from public.tracks where id = 'aaaaaaaa-0000-0000-0000-000000000010') = 1,
  'an unlocked track returns to the public listings'
);
reset role;

-- ===========================================================================
-- The lighter copy served for playback lives in the owner's folder
-- ===========================================================================
reset role;

insert into public.track_files (track_id, storage_path, original_filename, mime_type)
values ('aaaaaaaa-0000-0000-0000-000000000010',
        '11111111-1111-1111-1111-111111111111/d/four.mp3', 'four.mp3', 'audio/mpeg');

do $$
declare failed boolean := false;
begin
  begin
    update public.track_files
       set stream_path = '22222222-2222-2222-2222-222222222222/x/stolen.mp3'
     where track_id = 'aaaaaaaa-0000-0000-0000-000000000010';
  exception when others then
    failed := true;
  end;
  perform public.assert(failed, 'a stream copy outside the owner''s folder is refused');
end $$;

update public.track_files
   set stream_path = '11111111-1111-1111-1111-111111111111/d/four.stream.mp3'
 where track_id = 'aaaaaaaa-0000-0000-0000-000000000010';

select public.assert(
  (select stream_path from public.track_files
    where track_id = 'aaaaaaaa-0000-0000-0000-000000000010') is not null,
  'and one inside it is accepted'
);

\echo ''
\echo 'All security assertions passed.'
