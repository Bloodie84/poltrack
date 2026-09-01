-- ===========================================================================
-- Security assertions for the Sonora schema.
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

insert into public.track_files (track_id, storage_path, original_filename, mime_type, byte_size)
values ('aaaaaaaa-0000-0000-0000-000000000003',
        '11111111-1111-1111-1111-111111111111/c/three.mp3', 'three.mp3', 'audio/mpeg', 1234);

-- Anonymous visitor ---------------------------------------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false);

select public.assert(
  (select count(*) from public.tracks) = 2,
  'anonymous sees public + unlisted, never private'
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
  (select count(*) from public.tracks) = 2,
  'another signed-in user still cannot see the private track'
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

\echo ''
\echo 'All security assertions passed.'
