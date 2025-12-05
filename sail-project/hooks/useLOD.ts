import { useMemo } from 'react';

/**
 * Utility: Map a value from one range to another (Linear Interpolation)
 */
function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const normalized = (value - inMin) / (inMax - inMin);
  const mapped = outMin + (normalized * (outMax - outMin));
  // Clamp to output range
  if (outMin < outMax) {
    return Math.max(outMin, Math.min(mapped, outMax));
  } else {
    return Math.max(outMax, Math.min(mapped, outMin));
  }
}

/**
 * Hook: Calculates Level of Detail (LOD) threshold.
 * Returns a floating point number between 1.0 (All details) and 10.0 (Only Epoch-making).
 */
export function useLOD(viewRange: { min: number, max: number }, zoom: number) {
  return useMemo(() => {
    // --- 1. Time Dimension ---
    // Logic:
    // - Span <= 1 year   -> LOD 1.0  (Show finest details)
    // - Span >= 500 years -> LOD 10.0 (Show only most important)
    // Logarithmic scale fits time perception better.
    const timeSpan = Math.abs(viewRange.max - viewRange.min);
    const logSpan = Math.log10(Math.max(timeSpan, 1));

    // 500 years ≈ 10^2.7
    const timeLOD = mapRange(logSpan, 0, 2.7, 1.0, 10.0);

    // --- 2. Map Dimension ---
    // Logic:
    // - Zoom 10+ (City/Street) -> LOD 1.0 (Show details)
    // - Zoom <= 5 (Country/Continent) -> LOD 10.0 (Strict filtering)
    const mapLOD = mapRange(zoom, 5, 10, 10.0, 1.0);

    // --- 3. Strategy: Weighted Average ---
    // We combine both signals.
    // - If both are drilled down (City + 1 Year), LOD is 1.0 (Show all).
    // - If both are zoomed out (World + 5000 Years), LOD is 10.0 (Show only Top).
    // - Mixed signals (Country + 1 Year) -> LOD ~5.5 (Major events in that year).
    let finalLOD = (timeLOD + mapLOD) / 2;

    // Ensure float output within bounds
    return Math.max(1.0, Math.min(finalLOD, 10.0));

  }, [viewRange.min, viewRange.max, zoom]);
}