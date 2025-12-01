/**
 * src/types/index.ts
 * Core Data Models & Type Definitions
 * ------------------------------------------------------------------
 * This file contains all shared interfaces used across the application.
 * It serves as the contract between the Data Layer (Firebase/Constants)
 * and the UI Layer (Components).
 */

// --- Time System ---

/**
 * Standardized time structure to handle historical data ambiguity.
 * Handles both precise dates (e.g., "1945-09-02") and broad eras (e.g., "2500 BC").
 */
export interface ChronosTime {
  /** * The core year value. 
   * Negative values represent BC (e.g., -2500 is 2501 BC).
   * 0 is mathematically mapped to 1 AD (no Year 0 in standard chronology).
   */
  year: number;

  /** Optional: 1-12 */
  month?: number;

  /** Optional: 1-31 */
  day?: number;

  /** * Precision flag to determine how the date is formatted in the UI.
   * e.g., 'year' -> "1500 AD", 'day' -> "Oct 12, 1492"
   */
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute'; 
}

// --- Spatial System ---

/**
 * Location data including geographical coordinates and rendering metadata.
 * Defines how an event is represented on the map (point vs. region).
 */
export interface ChronosLocation {
  /** Latitude of the center anchor point */
  lat: number;

  /** Longitude of the center anchor point */
  lng: number;

  /** Natural language name of the place (e.g., "Roman Empire", "Paris") */
  placeName?: string; 

  /** * Spatial scale of the event.
   * Determines the default rendering radius or Z-level priority.
   */
  granularity: 'spot' | 'city' | 'territory' | 'continent';

  /** * Certainty of the location boundaries.
   * 'definite' = solid lines; 'approximate' = dashed lines/fuzzy edges.
   */
  certainty: 'definite' | 'approximate';

  /** * Optional: Override the default radius for circle rendering (in meters).
   * Used when 'regionId' is not provided but scale is known.
   */
  customRadius?: number; 

  /** * Optional: Reference ID for complex polygon shapes defined in constants/GeoJSON.
   * e.g., 'roman_empire_117ad', 'egypt'
   */
  regionId?: string; 
}

// --- Event Entity ---

/**
 * The main Event entity used throughout the application.
 * Matches the document structure intended for Firestore.
 */
export interface EventData {
  /** Unique identifier (UUID or Firestore Document ID) */
  id: string;

  /** Short headline title */
  title: string;

  /** Description or brief summary of the event */
  summary: string;

  /** Optional: URL to a thumbnail image */
  imageUrl?: string;

  /** Start time of the event */
  start: ChronosTime;

  /** Optional: End time (if the event is a duration, e.g., a war or dynasty) */
  end?: ChronosTime;

  /** Spatial location data */
  location: ChronosLocation;
}

// --- Map State & Layout ---

/**
 * Represents the current visible boundaries of the map viewport.
 * Used for Spatial Filtering (loading/showing only visible events).
 */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Result of the Smart Layout Engine calculation.
 * Defines the final pixel offset for an event card to avoid collisions.
 */
export interface LayoutResult {
  /** Horizontal offset in pixels from the anchor point */
  offsetX: number;

  /** Vertical offset in pixels (used for stacking/staggering) */
  offsetY: number;
}