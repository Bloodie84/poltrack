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
    };
    Views: Record<never, never>;
    Functions: {
      set_home_point: {
        Args: { p_lat: number | null; p_lon: number | null; p_zoom?: number | null };
        Returns: void;
      };
      set_default_detector: {
        Args: { p_detector_id: string };
        Returns: void;
      };
    };
    Enums: {
      privacy_level: PrivacyLevel;
      unit_system: UnitSystem;
    };
    CompositeTypes: Record<never, never>;
  };
};
