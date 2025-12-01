/**
 * src/types/index.ts
 * Core Data Models & Type Definitions
 * ------------------------------------------------------------------
 */

// --- Time System ---

export interface ChronosTime {
  year: number;
  month?: number;
  day?: number;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute'; 
}

// --- Spatial System ---

export interface ChronosLocation {
  lat: number;
  lng: number;
  placeName?: string; 
  granularity: 'spot' | 'city' | 'territory' | 'continent';
  certainty: 'definite' | 'approximate';
  customRadius?: number; 
  regionId?: string; 
}

// --- Source System [NEW] ---

/**
 * Represents an external citation or reference link.
 */
export interface EventSource {
  label: string; // e.g. "Wikipedia", "Britannica"
  url: string;
}

// --- Event Entity ---

export interface EventData {
  id: string;
  title: string;
  summary: string;
  imageUrl?: string;
  start: ChronosTime;
  end?: ChronosTime;
  location: ChronosLocation;
  
  /** External references and further reading links [NEW] */
  sources?: EventSource[];

  /** * Historical Importance / Magnitude (1-10) [NEW]
   * Used for Level-of-Detail (LOD) filtering.
   * 10 = Epoch-making (Visible at global zoom)
   * 1  = Trivial details (Visible only when fully zoomed in)
   */
  importance: number;
}

// --- Map State & Layout ---

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface LayoutResult {
  offsetX: number;
  offsetY: number;
}