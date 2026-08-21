/** Coordonnée géographique WGS84 (EPSG:4326), en degrés décimaux. */
export type LatLng = {
  lat: number;
  lon: number;
};

/** Emprise rectangulaire [ouest, sud, est, nord]. */
export type BBox = readonly [number, number, number, number];

/** Une position GPS brute telle que fournie par le navigateur, normalisée. */
export type GpsFix = LatLng & {
  /** Rayon d'incertitude horizontale à 68 % de confiance, en mètres. */
  accuracyM: number;
  altitudeM: number | null;
  altitudeAccuracyM: number | null;
  /** Cap en degrés depuis le nord géographique, si le mobile est en mouvement. */
  headingDeg: number | null;
  speedMs: number | null;
  /** Horodatage du fix (ms epoch). */
  timestamp: number;
};
