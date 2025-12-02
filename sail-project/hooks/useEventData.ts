import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EventData, MapBounds } from '../types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

/**
 * Hook: Manages data fetching and persistence
 * 1. Fetches data from API based on map bounds.
 * 2. Accumulates loaded events to prevent DOM removal during fade-out animations.
 */
export function useEventData(mapBounds: MapBounds | null, zoom: number) {
  // Construct API URL
  const queryKey = mapBounds
    ? `/api/events?n=${mapBounds.north}&s=${mapBounds.south}&e=${mapBounds.east}&w=${mapBounds.west}&z=${zoom}`
    : null;

  const { data: serverEvents, isLoading } = useSWR<EventData[]>(queryKey, fetcher, {
    keepPreviousData: true,
    dedupingInterval: 10000,
  });

  const allVisibleEvents = serverEvents || [];

  // Accumulator Logic
  const [allLoadedEvents, setAllLoadedEvents] = useState<EventData[]>([]);

  useEffect(() => {
    if (serverEvents) {
      setAllLoadedEvents(prev => {
        // Merge new events, avoiding duplicates
        const newItems = serverEvents.filter(n => !prev.find(p => p.id === n.id));
        if (newItems.length === 0) return prev;
        return [...prev, ...newItems];
      });
    }
  }, [serverEvents]);

  return {
    allVisibleEvents, // The current fresh data (for Heatmap & Logic)
    allLoadedEvents,  // The historical superset (for Animation DOM)
    isLoading
  };
}