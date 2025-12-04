import { useMemo } from 'react';

/**
 * Utility: Map a value from one range to another (Linear Interpolation)
 */
function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const normalized = (value - inMin) / (inMax - inMin);
  const mapped = outMin + (normalized * (outMax - outMin));
  if (outMin < outMax) {
    return Math.max(outMin, Math.min(mapped, outMax));
  } else {
    return Math.max(outMax, Math.min(mapped, outMin));
  }
}

/**
 * Hook: Calculates Level of Detail (LOD) threshold.
 */
export function useLOD(viewRange: { min: number, max: number }, zoom: number) {
  return useMemo(() => {
      // --- 1. Time Dimension ---
      // Span <= 1 year   -> LOD 1.0  (Show details)
      // Span >= 500 years -> LOD 10.0 (Strict)
      const timeSpan = Math.abs(viewRange.max - viewRange.min);
      const logSpan = Math.log10(Math.max(timeSpan, 1)); 
      const timeLOD = mapRange(logSpan, 0, 2.7, 1, 10);

      // --- 2. Space Dimension (Updated) ---
      // Range Definition:
      // - Zoom 10 (City/Street) -> LOD 1.0 (Show details)
      // - Zoom 5 (Country/France) -> LOD 10.0 (Strict filtering)
      // * Any zoom level < 5 (e.g., Continent/World) will be clamped to 10.0
      // * This keeps the map cleaner until the user commits to a specific country.
      const mapLOD = mapRange(zoom, 5, 10, 10, 1);

      // --- 3. Strategy: Weighted Average ---
      let finalLOD = (timeLOD + mapLOD) / 2;

      return Math.max(1, Math.min(finalLOD, 10));

  }, [viewRange.min, viewRange.max, zoom]);
}