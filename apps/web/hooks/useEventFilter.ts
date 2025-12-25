import { useMemo } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { isEventInBounds } from '../lib/geo-engine';

export function useEventFilter(
    allVisibleEvents: EventData[],
    mapBounds: MapBounds | null,
    lodThreshold: number,
    selectedEventId: string | undefined,
    focusedEvent: EventData | null,
    // [NEW] Additional params for advanced filtering
    interactionMode: 'exploration' | 'investigation' | 'playback' = 'exploration',
    currentDate: number,
    viewRange: { min: number, max: number },
    expandedEventIds: Set<string>,
    playedEventIds: Set<string> = new Set()
) {
    // 0. Focus Mode Filter
    const focusFilteredEvents = useMemo(() => {
        if (!focusedEvent) {
            return allVisibleEvents;
        }
        return allVisibleEvents;
    }, [allVisibleEvents, focusedEvent]);

    // 1. Spatial Filter
    const spatiallyFilteredEvents = useMemo(() => {
        if (!mapBounds) return [];

        return focusFilteredEvents.filter(event => {
            return isEventInBounds(
                event.location.lat,
                event.location.lng,
                mapBounds
            );
        });
    }, [mapBounds, focusFilteredEvents]);

    // 2. Render Filter (LOD) - Base Set
    const baseRenderableEvents = useMemo(() => {
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

    // 3. Final Playback/Mode Composition
    const renderableEvents = useMemo(() => {
        let result = baseRenderableEvents;

        // [FIX] Ensure Expanded OR Played Events are ALWAYS rendered (bypass LOD)
        if (expandedEventIds.size > 0 || playedEventIds.size > 0) {
            // Find events that are spatially visible but were filtered out by LOD
            const missing = spatiallyFilteredEvents.filter(
                e => (expandedEventIds.has(e.id) || playedEventIds.has(e.id)) && !result.some(r => r.id === e.id)
            );
            if (missing.length > 0) {
                result = [...result, ...missing];
            }
        }

        if (interactionMode === 'playback') {
            // Playback Mode: Persistent Dots (Curtain Effect)
            return result.filter(e => e.start.year <= currentDate && e.start.year >= viewRange.min);
        }

        if (interactionMode === 'investigation') {
            // Investigation Mode: Transient Dots (Only visible when thumb is near)
            const span = viewRange.max - viewRange.min;
            const threshold = span * 0.01; // 1% tolerance
            return result.filter(e => Math.abs(currentDate - e.start.year) <= threshold);
        }

        return result;
    }, [baseRenderableEvents, interactionMode, currentDate, viewRange.min, viewRange.max, expandedEventIds, playedEventIds, spatiallyFilteredEvents]);

    return { spatiallyFilteredEvents, renderableEvents };
}