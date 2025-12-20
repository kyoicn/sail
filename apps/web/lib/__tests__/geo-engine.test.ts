import { describe, it, expect } from 'vitest';
// [FIXED] Import from the correct local file
import { isEventInBounds } from '../geo-engine'; 
import { MapBounds } from '@sail/shared';

describe('Spatial Filtering Logic (Geo Engine)', () => {
  
  // Standard View: Europe Viewport
  const europeBounds: MapBounds = {
    north: 60, south: 30, west: -10, east: 40
  };

  it('identifies event inside bounds (Standard)', () => {
    // Rome (Lat 41, Lng 12) should be visible
    expect(isEventInBounds(41.9, 12.5, europeBounds)).toBe(true);
  });

  it('identifies event outside bounds (Standard)', () => {
    // New York (Lat 40, Lng -74) should be hidden
    expect(isEventInBounds(40.7, -74.0, europeBounds)).toBe(false);
  });

  // The Tricky Part: Infinite Scrolling
  // Imagine user dragged map 1 full circle to the right.
  // Bounds might be: West 350, East 400.
  const shiftedRightBounds: MapBounds = {
    north: 60, south: 30, west: 350, east: 400
  };

  it('projects event to shifted viewport (Right world)', () => {
    // Rome (Lng 12.5) -> Projected: 12.5 + 360 = 372.5
    // 372.5 is inside [350, 400] -> Should be TRUE
    expect(isEventInBounds(41.9, 12.5, shiftedRightBounds)).toBe(true);
  });

  // Imagine user dragged 2 circles to the left.
  const shiftedLeftBounds: MapBounds = {
    north: 60, south: 30, west: -730, east: -680
  };

  it('projects event to shifted viewport (Left world x2)', () => {
    // Rome (Lng 12.5) -> Projected: 12.5 - 720 = -707.5
    // -707.5 is inside [-730, -680] -> Should be TRUE
    expect(isEventInBounds(41.9, 12.5, shiftedLeftBounds)).toBe(true);
  });
  
  it('handles latitude correctly even if longitude matches', () => {
    // Longitude matches (12.5), but Latitude is way south (-20) -> FALSE
    expect(isEventInBounds(-20, 12.5, europeBounds)).toBe(false);
  });
});