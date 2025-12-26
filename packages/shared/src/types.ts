/**
 * src/types/index.ts
 * 
 * APPLICATION LAYER SCHEMA (CANONICAL)
 * ------------------------------------------------------------------
 * This file defines the Data Application Layer's data schema.
 * It is the Canonical Source of Truth for the Frontend application.
 * 
 * Relationship:
 * - Decoupled from the Database Schema ('create_table.sql').
 * - Populated by the Adapter Layer ('api/events/route.ts').
 * - Validated by the Runtime Validation Layer ('lib/schemas.ts').
 */

// --- Time System (Dual-Track) ---

export interface ChronosTime {
  // 1. Display Layer (Wall Time - Historical)
  // ALWAYS represents the "Local Time" where the event occurred.
  // We do NOT normalize historical events to UTC, because timezones didn't exist for most of history,
  // and converting "Pearl Harbor" to UTC makes no sense for historical narrative.
  // e.g. year: -1 represents "1 BC", year: 1 represents "1 AD".
  year: number;
  month?: number;      // 1-12
  day?: number;        // 1-31
  hour?: number;       // 0-23
  minute?: number;     // 0-59
  second?: number;     // 0-59 (Added for modern precision)
  millisecond?: number;// 0-999 (Added for scientific/modern precision)

  // 2. Calculation Layer (Linear Absolute Time - Astronomical)
  // A continuous decimal value used ONLY for sorting, indexing, and heatmap calculations.
  // It represents the "Astronomical Year" with fractional progress.
  // 
  // Conversion Rules:
  // - 1 AD  = 1.000...
  // - 1 BC  = 0.000... (Astronomical Year 0)
  // - 2 BC  = -1.000...
  // - 1970 AD = 1970.0 (Unix Epoch start)
  //
  // Formula: AstroYear + (DayOfYear_Index + Time_Fraction) / DaysInYear
  // This allows O(1) comparison between "44 BC" and "1945 AD".
  // [RENAME] Changed from 'timestamp' to 'astro_year' to avoid confusion with Unix Timestamps.
  astro_year: number;

  // Indicator of how granular this data is.
  // e.g. If 'day', we ignore hour/minute in UI display.
  precision: 'millennium' | 'century' | 'decade' | 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond' | 'unknown';
}

// --- Spatial System (Anchor + Geometry) ---

export interface ChronosLocation {
  // 1. Visual Anchor (Required)
  // The geographic center point for placing the Marker/Label on the map. 
  // For political regions (e.g. Roman Empire), this should be the Capital or Cultural Center,
  // NOT the geometric centroid (which might end up in the Mediterranean Sea).
  lat: number;
  lng: number;

  placeName?: string;
  granularity: 'spot' | 'area' | 'unknown';
  certainty: 'definite' | 'approximate' | 'unknown';
  customRadius?: number;
  regionId?: string;
  // Reference to semantic area (e.g. 'modern_japan') for fetching polygon shape
  areaId?: string;
}

// --- Source System ---

export interface EventSource {
  label: string;
  url: string;

}

// --- Event Entity ---

export interface EventData {
  id: string; // UUID

  // Used for data pipeline deduplication and upserts.
  // e.g. "dbpedia:Battle_of_Waterloo", "gdelt:123456"
  source_id?: string;

  title: string;
  summary: string;
  imageUrl?: string;

  start: ChronosTime;
  end?: ChronosTime; // Optional: Defines a duration (e.g. War, Dynasty)

  location: ChronosLocation;

  // Historical Importance (1.0 - 10.0)
  // 10.0: Epoch-making (Visible at Global Zoom)
  // 1.0: Local detail (Visible only at Street Zoom)
  // Now supports floating point precision (e.g. 5.5) for finer ranking.
  importance: number;

  collections?: string[];

  sources?: EventSource[];

  // Recursive Tree Relationship
  // List of child source_ids (e.g. ["gemini:battle_of_waterloo_phase_1"])
  children?: string[];
  // Pointer back to parent source_id (optional)
  parentId?: string;


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

// --- CMS / Administrative Layer ---

export interface AreaSummary {
  id: string; // Internal UUID
  area_id: string; // Slug (e.g. 'china_proper')
  display_name: string;
}

export interface AreaDetail extends AreaSummary {
  geometry: any; // GeoJSON
  description?: string;
  periods?: {
    period_id: string;
    display_name: string;
    role: 'primary' | 'associated';
    start_year: number;
    end_year: number;
  }[];
}

export interface HistoricalPeriod {
  id: string;
  period_id: string;
  display_name: string;
  description?: string;
  start_astro_year: number;
  end_astro_year: number;
  importance: number;
}

export interface EventCore {
  title: string;
  summary: string;
  imageUrl?: string;
  // Use Partial for flexibility during extraction
  start_time: Partial<ChronosTime>;
  end_time?: Partial<ChronosTime>;
  // Use loose location to allow missing lat/lng if unknown
  location: Partial<ChronosLocation>;
  importance: number;
  sources?: Partial<EventSource>[];
}