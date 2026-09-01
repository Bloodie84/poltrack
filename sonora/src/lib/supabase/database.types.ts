/**
 * Hand-written database types matching supabase/migrations.
 * Keep in sync when the schema changes.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

type Timestamps = { created_at: string; updated_at: string };

export type ProfileRow = Timestamps & {
  id: string;
  display_name: string;
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
    };
    Enums: { track_visibility: 'public' | 'unlisted' | 'private' };
    CompositeTypes: { [_ in never]: never };
  };
}
