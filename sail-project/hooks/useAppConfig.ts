import { useMemo } from 'react';

/**
 * Hook: Application Configuration
 * Centralizes logic for environment variables.
 * * Strategy:
 * 1. "dev:prod" script sets NEXT_PUBLIC_DATASET='prod', forcing production data in local.
 * 2. "dev" script leaves it empty, defaulting to NODE_ENV ('development' -> 'dev').
 * 3. Vercel deployment sets NODE_ENV to 'production', defaulting to 'prod'.
 */
export function useAppConfig() {
  // Dataset Selection Logic
  // Priority: Environment Variable > NODE_ENV Default
  const dataset = useMemo(() => {
      // 1. Explicit Env Var Override (e.g. set via "npm run dev:prod")
      if (process.env.NEXT_PUBLIC_DATASET) return process.env.NEXT_PUBLIC_DATASET;

      // 2. Default based on mode
      // development -> 'dev' (reads from events_dev table)
      // production -> 'prod' (reads from events table)
      return process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
  }, []);

  return {
    dataset,
    isDebugMode: process.env.NODE_ENV === 'development',
  };
}