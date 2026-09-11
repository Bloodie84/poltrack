/**
 * Hand-written database types matching supabase/migrations.
 * Keep in sync when the schema changes.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

type Timestamps = { created_at: string; updated_at: string };

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string;
  short_id: string;
  slug: string;
  bio: string | null;
  avatar_url: string | null;
}

export type TrackRow = Timestamps & {
  id: string;
  owner_id: string;
  short_id: string;
  slug: string;
  title: string;
  artist: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  cover_path: string | null;
  audio_path: string;
  duration: number;
  visibility: 'public' | 'unlisted' | 'private';
  downloads_enabled: boolean;
  play_count: number;
  download_count: number;
  /** bcrypt, set and compared only inside the database. */
  password_hash: string | null;
  /** Generated from password_hash: the application reads this and never the hash. */
  has_password: boolean;
  expires_at: string | null;
}

export type TrackFileRow = {
  id: string;
  track_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  format: string | null;
  byte_size: number;
  duration: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  channels: number | null;
  waveform: Json | null;
  /** The lighter copy served for playback; the master is kept for download. */
  stream_path: string | null;
  stream_byte_size: number | null;
  stream_bitrate: number | null;
  created_at: string;
}

export type EventRow = {
  id: string;
  track_id: string;
  listener_hash: string;
  user_id: string | null;
  created_at: string;
}

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>, Rel extends Relationship[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Rel;
};

type TrackRelationship = [
  {
    foreignKeyName: 'track_files_track_id_fkey';
    columns: ['track_id'];
    isOneToOne: true;
    referencedRelation: 'tracks';
    referencedColumns: ['id'];
  },
];

type EventRelationship = [
  {
    foreignKeyName: 'events_track_id_fkey';
    columns: ['track_id'];
    isOneToOne: false;
    referencedRelation: 'tracks';
    referencedColumns: ['id'];
  },
];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '12' };
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        Partial<ProfileRow> & { id: string },
        Partial<ProfileRow>
      >;
      tracks: Table<
        TrackRow,
        Omit<Partial<TrackRow>, 'owner_id' | 'title' | 'artist' | 'audio_path'> & {
          owner_id: string;
          title: string;
          artist: string;
          audio_path: string;
        },
        Partial<TrackRow>
      >;
      track_files: Table<
        TrackFileRow,
        Omit<Partial<TrackFileRow>, 'track_id' | 'storage_path' | 'original_filename' | 'mime_type'> & {
          track_id: string;
          storage_path: string;
          original_filename: string;
          mime_type: string;
        },
        Partial<TrackFileRow>,
        TrackRelationship
      >;
      plays: Table<
        EventRow,
        { track_id: string; listener_hash: string; user_id?: string | null },
        Partial<EventRow>,
        EventRelationship
      >;
      downloads: Table<
        EventRow,
        { track_id: string; listener_hash: string; user_id?: string | null },
        Partial<EventRow>,
        EventRelationship
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      increment_play: { Args: { p_track_id: string }; Returns: undefined };
      increment_download: { Args: { p_track_id: string }; Returns: undefined };
      /** Resolves one shared link. Returns nothing for a private track the
       *  caller does not own, and cannot be asked for more than one row. */
      track_by_short_id: {
        Args: { p_short_id: string };
        Returns: {
          id: string;
          owner_id: string;
          short_id: string;
          slug: string;
          title: string;
          artist: string;
          description: string | null;
          genre: string | null;
          cover_url: string | null;
          duration: number;
          visibility: 'public' | 'unlisted' | 'private';
          downloads_enabled: boolean;
          play_count: number;
          created_at: string;
          format: string | null;
          bitrate: number | null;
          sample_rate: number | null;
          waveform: Json | null;
        }[];
      };
      track_gate: {
        Args: { p_short_id: string };
        Returns: { expired: boolean; protected: boolean }[];
      };
      track_unlock: {
        Args: { p_short_id: string; p_password: string };
        /** The track id when the password is right, null otherwise. */
        Returns: string | null;
      };
      set_track_password: {
        Args: { p_track_id: string; p_password: string | null };
        Returns: boolean;
      };
    };
    Enums: { track_visibility: 'public' | 'unlisted' | 'private' };
    CompositeTypes: { [_ in never]: never };
  };
}
