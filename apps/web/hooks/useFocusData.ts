import { useMemo, useState, useEffect } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { useEventData } from './useEventData';
import { useEventsByIds } from './useEventsByIds';

/**
 * Hook: useFocusData
 * Unifies base view fetching, focused anchor event resolution, and forced child loading.
 */
export function useFocusData(
  mapBounds: MapBounds | null,
  zoom: number,
  viewRange: { min: number; max: number },
  dataset: string,
  collection: string | null,
  activeFocusedEventId: string | null
) {
  // 1. Resolve Source ID from UUID if needed (Circular dependency fix)
  const [activeFocusedSourceId, setActiveFocusedSourceId] = useState<string | null>(null);

  // 2. Base Data Fetching (Spatial/Temporal search)
  const {
    allLoadedEvents: baseLoadedEvents,
    isLoading: isBaseLoading
  } = useEventData(
    mapBounds,
    zoom,
    viewRange,
    dataset,
    collection,
    true, // enabled
    activeFocusedSourceId // context
  );

  // 3. Anchor Event Fetching (The currently focused event)
  const anchorIdList = useMemo(() =>
    activeFocusedEventId ? [activeFocusedEventId] : null
    , [activeFocusedEventId]);

  const { events: [anchorEvent] } = useEventsByIds(
    anchorIdList,
    dataset,
    'uuid'
  );

  // Resolve the best available focused event object
  const resolvedFocusEvent = useMemo(() =>
    anchorEvent || baseLoadedEvents.find(e => e.id === activeFocusedEventId) || null
    , [anchorEvent, baseLoadedEvents, activeFocusedEventId]);

  // Sync Source ID for Hybrid Fetch Context
  useEffect(() => {
    if (!activeFocusedEventId) {
      setActiveFocusedSourceId(null);
    } else if (resolvedFocusEvent && resolvedFocusEvent.source_id !== activeFocusedSourceId) {
      setActiveFocusedSourceId(resolvedFocusEvent.source_id || null);
    }
  }, [activeFocusedEventId, resolvedFocusEvent, activeFocusedSourceId]);

  // 4. Forced Child Fetching (Ensures children of focused event are ALWAYS visible)
  const childrenIdList = useMemo(() =>
    resolvedFocusEvent?.children || null
    , [resolvedFocusEvent?.children]);

  const { events: forcedChildEvents, isLoading: isForcedLoading } = useEventsByIds(
    childrenIdList,
    dataset,
    'source'
  );

  // 5. Unified Data Merge & Indexing
  const { allLoadedEvents, loadedEventsBySource } = useMemo(() => {
    const combined: EventData[] = [...baseLoadedEvents];
    const existingIds = new Set(baseLoadedEvents.map(e => e.id));
    const bySource = new Map<string, EventData>();

    // Index base
    baseLoadedEvents.forEach(e => {
      if (e.source_id) bySource.set(e.source_id, e);
    });

    // Add & Index Anchor
    if (resolvedFocusEvent) {
      if (!existingIds.has(resolvedFocusEvent.id)) {
        combined.push(resolvedFocusEvent);
        existingIds.add(resolvedFocusEvent.id);
      }
      if (resolvedFocusEvent.source_id) {
        bySource.set(resolvedFocusEvent.source_id, resolvedFocusEvent);
      }
    }

    // Add & Index Children
    forcedChildEvents.forEach(e => {
      if (!existingIds.has(e.id)) {
        combined.push(e);
      }
      if (e.source_id) {
        bySource.set(e.source_id, e);
      }
    });

    return { allLoadedEvents: combined, loadedEventsBySource: bySource };
  }, [baseLoadedEvents, resolvedFocusEvent, forcedChildEvents]);

  return {
    allLoadedEvents,
    allVisibleEvents: baseLoadedEvents, // Fresh descendants from RPC
    loadedEventsBySource,
    focusedEvent: resolvedFocusEvent,
    isLoading: isBaseLoading || isForcedLoading
  };
}
