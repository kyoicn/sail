import { useMemo } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { isEventInBounds } from '../lib/geo-engine'; // [NEW] Import logic

export function useEventFilter(
    allVisibleEvents: EventData[],
    mapBounds: MapBounds | null,
    lodThreshold: number,
    selectedEventId: string | undefined
) {
    // 1. Spatial Filter
    const spatiallyFilteredEvents = useMemo(() => {
        if (!mapBounds) return [];

        return allVisibleEvents.filter(event => {
            // Delegate math to the pure function
            return isEventInBounds(
                event.location.lat,
                event.location.lng,
                mapBounds
            );
        });
    }, [mapBounds, allVisibleEvents]);

    // 2. Render Filter (LOD)
    const renderableEvents = useMemo(() => {
        return spatiallyFilteredEvents.filter(event => {
            const isSelected = selectedEventId === event.id;
            const meetsImportance = event.importance >= lodThreshold;
            return meetsImportance || isSelected;
        });
    }, [spatiallyFilteredEvents, lodThreshold, selectedEventId]);

    return { spatiallyFilteredEvents, renderableEvents };
}