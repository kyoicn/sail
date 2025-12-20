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
export interface ChronosTime {
    year: number;
    month?: number;
    day?: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
    astro_year: number;
    precision: 'millennium' | 'century' | 'decade' | 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond' | 'unknown';
}
export interface ChronosLocation {
    lat: number;
    lng: number;
    geoJson?: object;
    placeName?: string;
    granularity: 'spot' | 'area' | 'unknown';
    certainty: 'definite' | 'approximate' | 'unknown';
    customRadius?: number;
    regionId?: string;
    areaId?: string;
}
export interface EventSource {
    label: string;
    url: string;
    provider?: 'wikidata' | 'gdelt' | 'manual' | 'ai';
    providerId?: string;
}
export interface EventData {
    id: string;
    source_id?: string;
    title: string;
    summary: string;
    imageUrl?: string;
    start: ChronosTime;
    end?: ChronosTime;
    location: ChronosLocation;
    importance: number;
    collections?: string[];
    sources?: EventSource[];
    children?: string[];
    pipeline?: {
        fetchedAt: string;
        version: number;
        tags?: string[];
    };
}
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
export interface AreaSummary {
    id: string;
    area_id: string;
    display_name: string;
}
export interface AreaDetail extends AreaSummary {
    geometry: any;
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
//# sourceMappingURL=types.d.ts.map