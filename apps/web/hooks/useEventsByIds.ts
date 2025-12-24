import { useState, useEffect } from 'react';
import { EventData } from '@sail/shared';
import { EventListSchema } from '../lib/schemas';

export function useEventsByIds(
  ids: string[] | null,
  dataset: string,
  idType: 'source' | 'uuid' = 'source' // Default to source for backward compat
) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEvents([]); // ALWAYS clear on dependency change to prevent stale leaks

    if (!ids || ids.length === 0) {
      return;
    }

    setIsLoading(true);

    const paramKey = idType === 'uuid' ? 'uuids' : 'ids';
    const params = new URLSearchParams({
      dataset,
      [paramKey]: ids.join(',')
    });

    fetch(`/api/events?${params.toString()}`)
      .then(res => res.json())
      .then(rawData => {
        const result = EventListSchema.safeParse(rawData);
        if (result.success) {
          setEvents(result.data);
        } else {
          console.error("Validation failed for ID fetch", result.error);
        }
      })
      .catch(err => console.error("Fetch by ID error:", err))
      .finally(() => setIsLoading(false));

  }, [ids?.join(','), dataset, idType]); // [FIX] Depend on content, not reference

  return { events, isLoading };
}
