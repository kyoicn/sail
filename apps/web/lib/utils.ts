import { EventData } from '@sail/shared';

/**
 * lib/utils.ts
 * General Utilities & Formatters
 * ------------------------------------------------------------------
 * Helper functions for string manipulation and spatial formatting.
 */

/**
 * Validates and merges class names (Basic version).
 */
export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Returns a display string for an event's location.
 * Prioritizes the manual 'placeName' if available, otherwise falls back to coordinates.
 */
export const getLocationString = (event: EventData): string => {
  return event.location.placeName || `${event.location.lat.toFixed(2)}, ${event.location.lng.toFixed(2)}`;
};

/**
 * Formats decimal coordinates into standard DMS-like string (Degrees/Minutes).
 * e.g., 48.85 N, 2.35 E
 */
export const formatCoordinates = (lat: number, lng: number): string => {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';

  const latDeg = Math.floor(Math.abs(lat));
  const latMin = Math.floor((Math.abs(lat) - latDeg) * 60);

  const lngDeg = Math.floor(Math.abs(lng));
  const lngMin = Math.floor((Math.abs(lng) - lngDeg) * 60);

  return `${latDeg}°${latMin}′${latDir}, ${lngDeg}°${lngMin}′${lngDir}`;
};