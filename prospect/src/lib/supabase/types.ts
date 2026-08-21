/**
 * Types de la base, alignés sur `supabase/migrations`.
 *
 * Écrits à la main tant que le projet Supabase n'existe pas ; ils pourront être
 * remplacés par `supabase gen types typescript` sans changer les imports.
 */

export type PrivacyLevel = 'private' | 'friends' | 'shared';
export type UnitSystem = 'metric' | 'imperial';
export type Theme = 'dark' | 'light' | 'system';
export type Locale = 'fr' | 'en';

export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Latitude du point d'ouverture de la carte (colonne générée, lecture seule). */
  home_lat: number | null;
  /** Longitude du point d'ouverture de la carte (colonne générée, lecture seule). */
  home_lon: number | null;
  home_zoom: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UserSettingsRow = {
  user_id: string;
  units: UnitSystem;
  locale: Locale;
  theme: Theme;
  default_basemap: string;
  default_sweep_width_m: number;
  gps_min_interval_s: number;
  gps_min_distance_m: number;
  gps_max_accuracy_m: number;
  keep_screen_awake: boolean;
  default_privacy: PrivacyLevel;
  created_at: string;
  updated_at: string;
};

export type DetectorRow = {
  id: string;
  user_id: string;
  brand: string;
  model: string;
  coil: string | null;
  frequency_khz: number | null;
  notes: string | null;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DetectorPresetRow = {
  id: string;
  user_id: string;
  detector_id: string;
  name: string;
  program: string | null;
  sensitivity: number | null;
  discrimination: number | null;
  ground_balance: string | null;
  iron_volume: number | null;
  extra: Record<string, unknown>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SessionStatus = 'active' | 'paused' | 'finished';

export type SessionRow = {
  id: string;
  user_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  paused_at: string | null;
  title: string | null;
  notes: string | null;
  detector_id: string | null;
  detector_preset_id: string | null;
  sweep_width_m: number;
  start_lat: number | null;
  start_lon: number | null;
  vehicle_lat: number | null;
  vehicle_lon: number | null;
  vehicle_label: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/** Vue `session_overview` : sortie enrichie des durées et de la distance. */
export type SessionOverviewRow = Omit<
  SessionRow,
  'detector_preset_id' | 'deleted_at'
> & {
  distance_m: number;
  point_count: number;
  elapsed_seconds: number;
  active_seconds: number;
  detector_brand: string | null;
  detector_model: string | null;
};

export type GpsPointRow = {
  id: string;
  session_id: string;
  user_id: string;
  lat: number;
  lon: number;
  recorded_at: string;
  accuracy_m: number | null;
  altitude_m: number | null;
  altitude_accuracy_m: number | null;
  speed_ms: number | null;
  heading_deg: number | null;
  is_reliable: boolean;
  created_at: string;
};

export type TrackRow = {
  session_id: string;
  user_id: string;
  point_count: number;
  distance_m: number;
  computed_at: string;
  created_at: string;
  updated_at: string;
};

export type FindCategoryRow = {
  id: string;
  user_id: string | null;
  slug: string;
  label: string;
  color: string;
  icon: string | null;
  is_waste: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        never,
        Partial<Pick<ProfileRow, 'display_name' | 'avatar_url' | 'home_zoom'>>
      >;
      user_settings: Table<
        UserSettingsRow,
        Pick<UserSettingsRow, 'user_id'> & Partial<UserSettingsRow>,
        Partial<Omit<UserSettingsRow, 'user_id' | 'created_at'>>
      >;
      detectors: Table<
        DetectorRow,
        Pick<DetectorRow, 'user_id' | 'brand' | 'model'> & Partial<DetectorRow>,
        Partial<Omit<DetectorRow, 'id' | 'user_id' | 'created_at'>>
      >;
      detector_presets: Table<
        DetectorPresetRow,
        Pick<DetectorPresetRow, 'user_id' | 'detector_id' | 'name'> &
          Partial<DetectorPresetRow>,
        Partial<Omit<DetectorPresetRow, 'id' | 'user_id' | 'created_at'>>
      >;
      find_categories: Table<
        FindCategoryRow,
        Pick<FindCategoryRow, 'user_id' | 'slug' | 'label'> & Partial<FindCategoryRow>,
        Partial<Omit<FindCategoryRow, 'id' | 'user_id' | 'created_at'>>
      >;
      sessions: Table<
        SessionRow,
        never,
        Partial<Pick<SessionRow, 'title' | 'notes' | 'detector_id' | 'deleted_at'>>
      >;
      gps_points: Table<GpsPointRow, never, never>;
      tracks: Table<TrackRow, never, never>;
    };
    Views: {
      session_overview: {
        Row: SessionOverviewRow;
        Relationships: [];
      };
    };
    Functions: {
      set_home_point: {
        Args: { p_lat: number | null; p_lon: number | null; p_zoom?: number | null };
        Returns: void;
      };
      set_default_detector: {
        Args: { p_detector_id: string };
        Returns: void;
      };
      start_session: {
        Args: {
          p_lat: number | null;
          p_lon: number | null;
          p_sweep_width_m?: number | null;
          p_detector_id?: string | null;
          p_title?: string | null;
          p_save_vehicle?: boolean;
        };
        Returns: string;
      };
      pause_session: { Args: { p_session_id: string }; Returns: void };
      resume_session: { Args: { p_session_id: string }; Returns: void };
      finish_session: { Args: { p_session_id: string }; Returns: void };
      rebuild_track: { Args: { p_session_id: string }; Returns: void };
      set_vehicle_point: {
        Args: {
          p_session_id: string;
          p_lat: number | null;
          p_lon: number | null;
          p_label?: string | null;
        };
        Returns: void;
      };
      append_gps_points: {
        Args: { p_session_id: string; p_points: unknown };
        Returns: number;
      };
      session_geojson: { Args: { p_session_id: string }; Returns: unknown };
      tracks_in_bbox: {
        Args: {
          p_west: number;
          p_south: number;
          p_east: number;
          p_north: number;
          p_from?: string | null;
          p_to?: string | null;
          p_limit?: number;
        };
        Returns: unknown;
      };
    };
    Enums: {
      privacy_level: PrivacyLevel;
      unit_system: UnitSystem;
    };
    CompositeTypes: Record<never, never>;
  };
};
