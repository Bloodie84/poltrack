-- ============================================================================
-- A lighter copy for playback.
--
-- Until now the same object served both listening and downloading, which had
-- two consequences. A listener on a phone pulled the master — fifty megabytes
-- of WAV to hear three minutes — and the downloads switch was advisory, since
-- anyone could take the file the player was already being handed.
--
-- A track can now carry a second object: an MP3 made in the browser at upload
-- time from the audio it had already decoded. Playback serves that one when it
-- exists; downloads always serve the master. Tracks without one behave exactly
-- as before, which is what keeps this safe to apply to a live database.
-- ============================================================================

alter table public.track_files add column if not exists stream_path       text;
alter table public.track_files add column if not exists stream_byte_size  bigint;
alter table public.track_files add column if not exists stream_bitrate    integer;

-- The same rule the master already lives under: an object named by a track must
-- belong to the person who owns the track. Without it a row could point the
-- streaming route at somebody else's file, and that route signs with the
-- service role.
--
-- A CHECK cannot look at another table, so this is a trigger. It is still the
-- database refusing the row rather than a route handler remembering to.
create or replace function public.assert_stream_path_owned()
returns trigger
language plpgsql
as $$
declare
  v_owner uuid;
begin
  if new.stream_path is null then
    return new;
  end if;

  select owner_id into v_owner from public.tracks where id = new.track_id;
  if v_owner is null or new.stream_path not like v_owner::text || '/%' then
    raise exception 'stream_path must live in the track owner''s own folder';
  end if;

  return new;
end;
$$;

drop trigger if exists track_files_stream_path_owned on public.track_files;
create trigger track_files_stream_path_owned
  before insert or update of stream_path, track_id on public.track_files
  for each row execute function public.assert_stream_path_owned();
