import { useMemo } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { isEventInBounds } from '../lib/geo-engine'; // [NEW] Import logic

export function useEventFilter(
    allVisibleEvents: EventData[],
    mapBounds: MapBounds | null,
    lodThreshold: number,
    selectedEventId: string | undefined,
    focusedEvent: EventData | null
) {
    // 0. Focus Mode Filter
    const focusFilteredEvents = useMemo(() => {
        // [FIX] In Hybrid Mode, we trust the `allVisibleEvents` (which comes from Recursive RPC)
        // plus `forcedChildEvents` (which comes from ID RPC).
        // The previous logic filtered by `focusedEvent.children`, which hid grandchildren (descendants).

        // So if we have a focusedEvent, we simply pass through everything.
        // We might want to filter out the *Fetch Root* itself if it's in the list?
        // But generally, showing descendants is the goal.

        if (!focusedEvent) {
            return allVisibleEvents;
        }

        // Optional: We could verify lineage if we had that data, but we don't.
        // We assume the upstream data is already filtered by context (via useEventData's rootId).
        return allVisibleEvents;
    }, [allVisibleEvents, focusedEvent]);

    // 1. Spatial Filter
    const spatiallyFilteredEvents = useMemo(() => {
        if (!mapBounds) return [];

        return focusFilteredEvents.filter(event => {
            // Delegate math to the pure function
            return isEventInBounds(
                event.location.lat,
                event.location.lng,
                mapBounds
            );
        });
    }, [mapBounds, focusFilteredEvents]);

    // 2. Render Filter (LOD)
    const renderableEvents = useMemo(() => {
        const childrenSet = new Set(focusedEvent?.children || []);
        return spatiallyFilteredEvents.filter(event => {
            const isSelected = selectedEventId === event.id;
            const isFocusRoot = focusedEvent && event.id === focusedEvent.id;
            const isChildOfFocus = event.source_id && childrenSet.has(event.source_id);

            const meetsImportance = event.importance >= lodThreshold;

            // Bypass LOD if it's the focus root, a child of the root, or explicitly selected
            return meetsImportance || isSelected || isFocusRoot || isChildOfFocus;
        });
    }, [spatiallyFilteredEvents, lodThreshold, selectedEventId, focusedEvent]);

    return { spatiallyFilteredEvents, renderableEvents };
}