import { useMemo } from 'react';
import { EventData, MapBounds } from '../types';

/**
 * Hook: Handles complex spatial and importance filtering
 * Includes the "Infinite Map Wrapping" projection logic.
 */
export function useEventFilter(
    allVisibleEvents: EventData[],
    mapBounds: MapBounds | null,
    lodThreshold: number,
    selectedEventId: string | undefined
) {
    // 1. Spatial Filter (With Nearest Neighbor Projection)
    const spatiallyFilteredEvents = useMemo(() => {
        if (!mapBounds) return [];

        const { west, east, north, south } = mapBounds;
        const lngSpan = east - west;
        const isGlobalView = lngSpan >= 360; 
        const mapCenterLng = (west + east) / 2;

        return allVisibleEvents.filter(event => {
            // Latitude Check
            if (event.location.lat > north || event.location.lat < south) return false;
            
            // Global Optimization
            if (isGlobalView) return true;

            // Longitude Projection Logic
            const lng = event.location.lng;
            const offset = Math.round((mapCenterLng - lng) / 360);
            const projectedLng = lng + (offset * 360);

            return projectedLng >= west && projectedLng <= east;
        });
    }, [mapBounds, allVisibleEvents]);

    // 2. Render Filter (LOD Application)
    const renderableEvents = useMemo(() => {
        return spatiallyFilteredEvents.filter(event => {
            const isSelected = selectedEventId === event.id;
            const meetsImportance = event.importance >= lodThreshold;
            return meetsImportance || isSelected;
        });
    }, [spatiallyFilteredEvents, lodThreshold, selectedEventId]);

    return { spatiallyFilteredEvents, renderableEvents };
}