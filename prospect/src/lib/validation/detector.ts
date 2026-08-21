import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();

export const detectorSchema = z.object({
  brand: z.string().trim().min(1, 'La marque est obligatoire.').max(60),
  model: z.string().trim().min(1, 'Le modèle est obligatoire.').max(60),
  coil: optionalText(60),
  frequency_khz: z
    .number()
    .positive('La fréquence doit être positive.')
    .max(9999)
    .nullable(),
  notes: optionalText(2000),
  is_default: z.boolean(),
});

export type DetectorInput = z.infer<typeof detectorSchema>;
