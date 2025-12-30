
export type Dataset = 'prod' | 'staging' | 'dev' | 'local';

/**
 * lib/env.ts
 * Centralized Environment & Dataset Detection
 * ------------------------------------------------------------------
 * Unifies the logic for determining which Supabase schema (dataset) to use.
 * Handles Local, Dev, Staging (Vercel Preview), and Prod (Vercel Production).
 */

export function getDataset(overrideValue?: string | null): Dataset {
  // 1. Explicit Override (from URL param or Request Body)
  // We only accept valid Dataset values.
  if (overrideValue && ['prod', 'staging', 'dev', 'local'].includes(overrideValue)) {
    return overrideValue as Dataset;
  }

  // 2. Environment Variable Override (e.g. set via "npm run dev:prod")
  // NEXT_PUBLIC_ prefix makes it available on both client & server.
  if (process.env.NEXT_PUBLIC_DATASET) {
    if (['prod', 'staging', 'dev', 'local'].includes(process.env.NEXT_PUBLIC_DATASET)) {
      return process.env.NEXT_PUBLIC_DATASET as Dataset;
    }
  }

  // 3. Vercel Environment Auto-Detection
  // NEXT_PUBLIC_VERCEL_ENV is preferred on client, VERCEL_ENV on server.
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV;

  if (vercelEnv === 'production') return 'prod';
  if (vercelEnv === 'preview') return 'staging';
  if (vercelEnv === 'development') return 'dev';

  // 4. NODE_ENV Fallback
  // development -> 'dev'
  // production -> 'prod'
  return process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
}

/**
 * Returns the Supabase schema name for a given dataset.
 * Currently, dataset names map 1:1 to schema names.
 */
export function getSchemaForDataset(dataset: Dataset): string {
  // Potentially handle 'prod' -> 'public' mapping here if needed in the future.
  return dataset;
}
