import { Dataset, getDataset as sharedGetDataset } from '@sail/shared';

export type { Dataset };

/**
 * lib/env.ts
 * Centralized Environment & Dataset Detection (Web Wrapper)
 * ------------------------------------------------------------------
 */

export const getDataset = sharedGetDataset;

/**
 * Returns the Supabase schema name for a given dataset.
 * Currently, dataset names map 1:1 to schema names.
 */
export function getSchemaForDataset(dataset: Dataset): string {
  // Potentially handle 'prod' -> 'public' mapping here if needed in the future.
  return dataset;
}
