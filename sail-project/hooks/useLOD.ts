import { useMemo } from 'react';

/**
 * Hook: Calculates Level of Detail (LOD) threshold
 * Uses a "Weighted Average" strategy between Time Span and Map Zoom.
 */
export function useLOD(viewRange: { min: number, max: number }, zoom: number) {
  return useMemo(() => {
      // 1. Time Dimension
      const timeSpan = viewRange.max - viewRange.min;
      let timeLOD = 1;
      if (timeSpan > 2000) timeLOD = 9;
      else if (timeSpan > 1000) timeLOD = 8;
      else if (timeSpan > 500) timeLOD = 6;
      else if (timeSpan > 100) timeLOD = 4;
      else if (timeSpan > 50) timeLOD = 2;
      else timeLOD = 1;

      // 2. Space Dimension
      let mapLOD = 1;
      if (zoom < 3) mapLOD = 9;
      else if (zoom < 5) mapLOD = 8;
      else if (zoom < 6) mapLOD = 6;
      else if (zoom < 8) mapLOD = 4;
      else if (zoom < 10) mapLOD = 2;
      else mapLOD = 1;

      // 3. Strategy: Weighted Average
      return Math.floor((timeLOD + mapLOD) / 2);
  }, [viewRange, zoom]);
}