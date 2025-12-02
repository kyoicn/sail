import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EventData, MapBounds } from '../types';
import { EventListSchema } from '../lib/schemas';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }
  
  const rawData = await res.json();
  const result = EventListSchema.safeParse(rawData);

  if (!result.success) {
    console.error("🚨 Data Validation Failed!", result.error.format());
    return []; 
  }

  return result.data;
};

/**
 * Hook: Manages data fetching and persistence
 * [REFACTORED] Now accepts 'dataset' as a pure argument. 
 * It no longer knows about URL params or Environment variables.
 */
export function useEventData(
    mapBounds: MapBounds | null, 
    zoom: number, 
    dataset: string // <--- Injected dependency
) {
  const queryKey = mapBounds
    ? `/api/events?n=${mapBounds.north}&s=${mapBounds.south}&e=${mapBounds.east}&w=${mapBounds.west}&z=${zoom}&dataset=${dataset}`
    : null;

  const { data: serverEvents, isLoading, error } = useSWR<EventData[]>(queryKey, fetcher, {
    keepPreviousData: true,
    dedupingInterval: 10000,
  });

  useEffect(() => {
    if (error) console.error("SWR Fetch Error:", error);
  }, [error]);

  const allVisibleEvents = serverEvents || [];

  const [allLoadedEvents, setAllLoadedEvents] = useState<EventData[]>([]);

  useEffect(() => {
    if (serverEvents) {
      setAllLoadedEvents(prev => {
        const newItems = serverEvents.filter(n => !prev.find(p => p.id === n.id));
        if (newItems.length === 0) return prev;
        return [...prev, ...newItems];
      });
    }
  }, [serverEvents]);

  return {
    allVisibleEvents, 
    allLoadedEvents,
    isLoading,
    isError: !!error
  };
}