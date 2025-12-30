
export type Dataset = 'prod' | 'staging' | 'dev' | 'local';

/**
 * Shared Environment & Dataset Detection
 * ------------------------------------------------------------------
 * Unifies the logic for determining which Supabase schema (dataset) to use.
 * Handles Local, Dev, Staging (Vercel Preview), and Prod (Vercel Production).
 */

export function getDataset(overrideValue?: string | null): Dataset {
  // 1. Explicit Override (from URL param or Request Body)
  if (overrideValue && ['prod', 'staging', 'dev', 'local'].includes(overrideValue)) {
    return overrideValue as Dataset;
  }

  // 2. Environment Variable Override
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DATASET) {
    if (['prod', 'staging', 'dev', 'local'].includes(process.env.NEXT_PUBLIC_DATASET)) {
      return process.env.NEXT_PUBLIC_DATASET as Dataset;
    }
  }

  // 3. Vercel Environment Auto-Detection
  const vercelEnv = typeof process !== 'undefined' ? (process.env?.NEXT_PUBLIC_VERCEL_ENV || process.env?.VERCEL_ENV) : undefined;

  if (vercelEnv === 'production') return 'prod';
  if (vercelEnv === 'preview') return 'staging';
  if (vercelEnv === 'development') return 'dev';

  // 4. NODE_ENV Fallback
  const nodeEnv = typeof process !== 'undefined' ? process.env?.NODE_ENV : 'production';
  return nodeEnv === 'development' ? 'dev' : 'prod';
}
