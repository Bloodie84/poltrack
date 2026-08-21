import { z } from 'zod';

/**
 * Les Server Actions sont une frontière publique : tout ce qui arrive du
 * navigateur est validé ici avant d'atteindre la base, même si le client
 * applique déjà ses propres contrôles.
 */

/** Taille maximale d'un lot de points, pour borner la charge d'un appel. */
export const MAX_POINTS_PER_BATCH = 500;

const finiteNumber = z.number().refine(Number.isFinite, 'Valeur non finie.');

export const pendingPointSchema = z.object({
  id: z.uuid(),
  lat: finiteNumber.min(-90).max(90),
  lon: finiteNumber.min(-180).max(180),
  recorded_at: z.iso.datetime(),
  accuracy_m: finiteNumber.min(0).max(100_000).nullable(),
  altitude_m: finiteNumber.min(-500).max(100_000).nullable(),
  altitude_accuracy_m: finiteNumber.min(0).max(100_000).nullable(),
  speed_ms: finiteNumber.min(0).max(1000).nullable(),
  heading_deg: finiteNumber.min(0).max(360).nullable(),
  is_reliable: z.boolean(),
});

export const pointBatchSchema = z.array(pendingPointSchema).max(MAX_POINTS_PER_BATCH);

export const startSessionSchema = z.object({
  lat: finiteNumber.min(-90).max(90).nullable(),
  lon: finiteNumber.min(-180).max(180).nullable(),
  title: z.string().trim().max(120).nullable(),
  saveVehicle: z.boolean(),
  detectorId: z.uuid().nullable(),
});

export const vehiclePointSchema = z.object({
  sessionId: z.uuid(),
  lat: finiteNumber.min(-90).max(90).nullable(),
  lon: finiteNumber.min(-180).max(180).nullable(),
  label: z.string().trim().max(60).nullable(),
});

export const sessionDetailsSchema = z.object({
  sessionId: z.uuid(),
  title: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(4000).nullable(),
  detectorId: z.uuid().nullable(),
});

export const bboxSchema = z.object({
  west: finiteNumber.min(-180).max(180),
  south: finiteNumber.min(-90).max(90),
  east: finiteNumber.min(-180).max(180),
  north: finiteNumber.min(-90).max(90),
});

export type PendingPointInput = z.infer<typeof pendingPointSchema>;
export type StartSessionInput = z.infer<typeof startSessionSchema>;
