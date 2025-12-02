import { MapBounds } from '../types';

/**
 * Geo Engine: Core spatial calculations
 * Independent of React, strictly pure functions.
 */

/**
 * Checks if an event is visible in the given bounds
 * supporting infinite longitude wrapping (Nearest Neighbor Projection).
 */
export function isEventInBounds(
    eventLat: number,
    eventLng: number,
    bounds: MapBounds
): boolean {
    const { west, east, north, south } = bounds;
    
    // 1. Latitude Check
    if (eventLat > north || eventLat < south) return false;

    // 2. Global View Optimization
    const lngSpan = east - west;
    if (lngSpan >= 360) return true;

    // 3. Projection Logic
    const mapCenterLng = (west + east) / 2;
    const offset = Math.round((mapCenterLng - eventLng) / 360);
    const projectedLng = eventLng + (offset * 360);

    return projectedLng >= west && projectedLng <= east;
}