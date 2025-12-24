import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EventData, MapBounds } from '@sail/shared';
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
  viewRange: { min: number, max: number }, // [NEW] Time Viewport
  dataset: string,
  collection: string | null = null,
  enabled: boolean = true, // [NEW] Control Flag
  rootId: string | null = null // [NEW] Hybrid Fetch Context
) {
  // [NEW] Local state for Debounced Time Range
  // Initialize with a wide global buffer or current view
  const [fetchedTimeRange, setFetchedTimeRange] = useState({
    min: viewRange.min, // Initial: just view
    max: viewRange.max
  });

  // [NEW] Buffer & Debounce Logic
  useEffect(() => {
    // 1. Calculate Buffered Target
    const span = viewRange.max - viewRange.min;
    const padding = span * 1.5; // 1.5 screen widths on each side
    const targetMin = Math.floor(viewRange.min - padding);
    const targetMax = Math.ceil(viewRange.max + padding);

    // 2. Debounce Update
    const handler = setTimeout(() => {
      setFetchedTimeRange({ min: targetMin, max: targetMax });
    }, 300); // 300ms delay to wait for settling

    return () => clearTimeout(handler);
  }, [viewRange.min, viewRange.max]);


  const [allLoadedEvents, setAllLoadedEvents] = useState<EventData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [serverEvents, setServerEvents] = useState<EventData[]>([]);

  // [NEW] Cache Clearing on Context Switch
  // When switching collections or focus contexts (rootId), we must clear the accumulated buffer
  // to avoid mixing unrelated data (e.g. Global events vs Focus Descendants).
  useEffect(() => {
    setAllLoadedEvents([]);
    setServerEvents([]);
  }, [dataset, collection, rootId]);

  useEffect(() => {
    // If disabled or no bounds, don't fetch
    if (!enabled || !mapBounds) {
      if (!enabled) {
        // If disabled, we might want to keep existing events or clear?
        // Keeping them allows for smooth transitions back.
        // setServerEvents([]); 
      }
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // [NEW] Use Buffered Time Range
    const queryParams = new URLSearchParams({
      minYear: fetchedTimeRange.min.toString(),
      maxYear: fetchedTimeRange.max.toString(),
      n: mapBounds.north.toString(),
      s: mapBounds.south.toString(),
      e: mapBounds.east.toString(),
      w: mapBounds.west.toString(),
      z: zoom.toString(),
      dataset: dataset,
      limit: '1000' // [NEW] Explicit Limit
    });

    if (collection) {
      queryParams.append('collection', collection);
    }

    // [FIX] Pass Context for Hybrid Fetching
    if (rootId) {
      queryParams.append('root_id', rootId);
    }

    fetch(`/api/events?${queryParams.toString()}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`API Error: ${res.status}`);
        }
        return res.json();
      })
      .then(rawData => {
        if (!isMounted) return;
        const result = EventListSchema.safeParse(rawData);

        if (!result.success) {
          console.error("🚨 Data Validation Failed!", result.error.format());
          setError(new Error("Data validation failed"));
          setServerEvents([]);
          return;
        }


        setServerEvents(result.data);
      })
      .catch(err => {
        if (!isMounted) return;
        console.error("Fetch Error:", err);
        setError(err);
        setServerEvents([]);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [mapBounds, zoom, dataset, collection, fetchedTimeRange, enabled, rootId]); // [NEW] Fetch on Time Change too

  useEffect(() => {
    if (serverEvents.length > 0) {
      setAllLoadedEvents(prev => {
        const newItems = serverEvents.filter(n => !prev.find(p => p.id === n.id));
        if (newItems.length === 0) return prev;
        return [...prev, ...newItems];
      });
    }
  }, [serverEvents]);

  const allVisibleEvents = serverEvents || [];

  return {
    allVisibleEvents,
    allLoadedEvents,
    isLoading,
    isError: !!error
  };
}