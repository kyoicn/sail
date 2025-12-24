import { MapBounds } from '@sail/shared';

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

/**
 * Calculates the bounding box for a list of events.
 * Returns null if no events are provided.
 */
export function getBoundsForEvents(events: { location: { lat: number; lng: number } }[]): MapBounds | null {
    if (events.length === 0) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    events.forEach(e => {
        if (e.location.lat < minLat) minLat = e.location.lat;
        if (e.location.lat > maxLat) maxLat = e.location.lat;
        if (e.location.lng < minLng) minLng = e.location.lng;
        if (e.location.lng > maxLng) maxLng = e.location.lng;
    });

    // Add 10% padding
    const latBuffer = (maxLat - minLat) * 0.1 || 0.1;
    const lngBuffer = (maxLng - minLng) * 0.1 || 0.1;

    return {
        north: maxLat + latBuffer,
        south: minLat - latBuffer,
        east: maxLng + lngBuffer,
        west: minLng - lngBuffer
    };
}