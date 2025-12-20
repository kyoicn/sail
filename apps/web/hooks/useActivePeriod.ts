
import useSWR from 'swr';
import { useMemo } from 'react';
import { MapBounds } from '@sail/shared';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ActivePeriod {
  period_name: string;
  description: string;
  importance: number;
}

export function useActivePeriod(
  mapBounds: MapBounds | null,
  minYear: number,
  maxYear?: number, // Optional, can be single point if omitted (or same as minYear)
  dataset: string = 'prod'
) {
  // Debounce/Rounding to prevent excessive calls
  // Round coordinates to 2 decimal places and year to integer for cache stability
  const queryKey = useMemo(() => {
    if (!mapBounds) return null;

    const params = new URLSearchParams({
      min_lng: mapBounds.west.toFixed(2),
      min_lat: mapBounds.south.toFixed(2),
      max_lng: mapBounds.east.toFixed(2),
      max_lat: mapBounds.north.toFixed(2),
      min_year: Math.floor(minYear).toString(),
      max_year: Math.floor(maxYear ?? minYear).toString(),
      dataset
    });

    return `/api/periods?${params.toString()}`;
  }, [mapBounds, minYear, maxYear, dataset]);

  const { data, error, isLoading } = useSWR<ActivePeriod[]>(queryKey, fetcher, {
    dedupingInterval: 1000, // Prevent spamming
    keepPreviousData: true  // Smooth transitions
  });

  return {
    activePeriods: data || [],
    isLoading,
    error
  };
}
