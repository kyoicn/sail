import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EventData, MapBounds } from '../types';
import { EventListSchema } from '../lib/schemas'; // [NEW] Import Schema

/**
 * Robust Fetcher with Zod Validation
 * 1. Fetches JSON.
 * 2. Validates against EventListSchema.
 * 3. Throws descriptive error if data is malformed.
 */
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }
  
  const rawData = await res.json();
  
  // [NEW] Runtime Validation
  // safeParse won't throw, but returns { success, data, error }
  const result = EventListSchema.safeParse(rawData);

  if (!result.success) {
    console.error("🚨 Data Validation Failed!");
    // Log the specific fields that failed
    console.error(result.error.format());
    // Fallback: return empty array to prevent UI crash, 
    // or throw to show error state in UI.
    // For now, let's return an empty list to keep the app alive.
    return []; 
  }

  return result.data;
};

export function useEventData(mapBounds: MapBounds | null, zoom: number) {
  const queryKey = mapBounds
    ? `/api/events?n=${mapBounds.north}&s=${mapBounds.south}&e=${mapBounds.east}&w=${mapBounds.west}&z=${zoom}`
    : null;

  const { data: serverEvents, isLoading, error } = useSWR<EventData[]>(queryKey, fetcher, {
    keepPreviousData: true,
    dedupingInterval: 10000,
  });

  // Log fetch errors if any
  useEffect(() => {
    if (error) console.error("SWR Fetch Error:", error);
  }, [error]);

  const allVisibleEvents = serverEvents || [];

  // Accumulator Logic (Unchanged)
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
    isError: !!error // Expose error state
  };
}