import { useMemo } from 'react';
import { getDataset } from '../lib/env';

/**
 * Hook: Application Configuration
 * Centralizes logic for environment variables.
 */
export function useAppConfig() {
  const dataset = useMemo(() => getDataset(), []);

  return {
    dataset,
    isDev: dataset === 'dev',
    isStaging: dataset === 'staging',
    isProd: dataset === 'prod',
    isLocal: dataset === 'local',
    isDebugMode: process.env.NODE_ENV === 'development',
  };
}