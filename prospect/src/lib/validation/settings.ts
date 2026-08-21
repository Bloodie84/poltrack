import { z } from 'zod';

/**
 * Schémas de validation partagés client/serveur.
 * Les bornes reflètent exactement les CHECK constraints des migrations : une
 * saisie refusée ici l'aurait été par la base.
 */

export const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'Le nom ne peut pas être vide.')
    .max(80, 'Maximum 80 caractères.')
    .nullable(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export const settingsSchema = z.object({
  units: z.enum(['metric', 'imperial']),
  locale: z.enum(['fr', 'en']),
  theme: z.enum(['dark', 'light', 'system']),
  default_sweep_width_m: z
    .number()
    .min(0.2, 'Largeur minimale : 0,20 m.')
    .max(10, 'Largeur maximale : 10 m.'),
  gps_min_interval_s: z.number().int().min(1).max(60),
  gps_min_distance_m: z.number().min(0).max(100),
  gps_max_accuracy_m: z.number().min(1).max(500),
  keep_screen_awake: z.boolean(),
  default_privacy: z.enum(['private', 'friends', 'shared']),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export const homePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  zoom: z.number().min(0).max(22),
});

export type HomePointInput = z.infer<typeof homePointSchema>;
