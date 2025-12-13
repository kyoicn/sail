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
  dataset: string, // <--- Injected dependency
  collection: string | null = null
) {
  const queryKey = mapBounds
    ? `/api/events?n=${mapBounds.north}&s=${mapBounds.south}&e=${mapBounds.east}&w=${mapBounds.west}&z=${zoom}&dataset=${dataset}`
    : null;

  const [allLoadedEvents, setAllLoadedEvents] = useState<EventData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [serverEvents, setServerEvents] = useState<EventData[]>([]);

  useEffect(() => {
    // If no bounds yet, don't fetch
    if (!mapBounds) {
      setServerEvents([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    const queryParams = new URLSearchParams({
      minYear: '-5000', // For now, we fetch a wide range or based on view
      maxYear: '2050',
      n: mapBounds.north.toString(),
      s: mapBounds.south.toString(),
      e: mapBounds.east.toString(),
      w: mapBounds.west.toString(),
      z: zoom.toString(),
      dataset: dataset
    });

    if (collection) {
      queryParams.append('collection', collection);
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
  }, [mapBounds, zoom, dataset, collection]);

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