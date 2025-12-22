/**
 * app/api/events/route.ts
 * 
 * ADAPTER LAYER (DATA <=> APPLICATION)
 * ------------------------------------------------------------------
 * This file acts as the Adapter connecting the Data Layer to the Application Layer.
 * It is responsible for fetching raw data from the DB and transforming it
 * into the Canonical Application Schema.
 * 
 * Relationship:
 * - Fetches raw data from 'create_table.sql' (Data Layer).
 * - Transforms/Maps data to match 'types/index.ts' (Application Layer).
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { MOCK_EVENTS } from '../../../lib/constants';
import { EventData } from '@sail/shared';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // [NEW] Dataset Switcher
  // Determine Environment (dev / staging / prod)
  // Logic: 
  // 1. 'env' param takes precedence.
  // 2. 'dataset' param supported for backward compatibility (legacy).
  // 3. Default to 'prod'.
  const envParam = searchParams.get('env') || searchParams.get('dataset');
  const env = (envParam === 'dev' || envParam === 'staging' || envParam === 'local') ? envParam : 'prod';

  // Local Mode: Return mock data directly (No DB call)
  if (env === 'local') {
    return NextResponse.json(MOCK_EVENTS, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  // Decide which RPC to call
  let rpcName = 'get_events_in_view'; // default (prod)
  if (env === 'dev') rpcName = 'get_events_in_view_dev';
  if (env === 'staging') rpcName = 'get_events_in_view_staging';

  const minYear = parseFloat(searchParams.get('minYear') || '-5000');
  const maxYear = parseFloat(searchParams.get('maxYear') || '2050');
  const zoom = parseFloat(searchParams.get('z') || '10');

  let north = parseFloat(searchParams.get('n') || '90');
  let south = parseFloat(searchParams.get('s') || '-90');
  let east = parseFloat(searchParams.get('e') || '180');
  let west = parseFloat(searchParams.get('w') || '-180');

  const lngSpan = east - west;

  // [CRITICAL FIX] "Antipodal Edge" Prevention
  const isGlobalView =
    zoom < 5.5 ||
    lngSpan >= 160 ||
    (west <= -180 && east >= 180);

  // Prepare RPC Arguments
  let rpcWest, rpcEast, rpcNorth, rpcSouth;

  if (isGlobalView) {
    rpcWest = null; rpcEast = null; rpcNorth = null; rpcSouth = null;
  } else {
    rpcWest = Math.max(-180, west);
    rpcEast = Math.min(180, east);
    rpcNorth = Math.min(90, north);
    rpcSouth = Math.max(-90, south);

    if (rpcWest > rpcEast) {
      rpcWest = null; rpcEast = null; rpcNorth = null; rpcSouth = null;
    }
  }

  const minImportance = 1;

  // Collection Filter
  const collectionFilter = searchParams.get('collection') || null;

  // Determine Limit (Default to 1000 if not specified)
  const limit = parseInt(searchParams.get('limit') || '1000', 10);

  const { data, error } = await supabase.rpc(rpcName, {
    min_lat: rpcSouth,
    max_lat: rpcNorth,
    min_lng: rpcWest,
    max_lng: rpcEast,
    min_year: minYear,
    max_year: maxYear,
    min_importance: minImportance,
    collection_filter: collectionFilter,
    p_limit: limit
  });

  if (error) {
    console.error('Supabase RPC Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Explicitly map to EventData[]
  const formattedEvents: EventData[] = (data || []).map((row: any): EventData => {
    // Unpack JSONB Time Entries
    const startEntry = row.start_time_entry || {};
    const endEntry = row.end_time_entry || null;

    const sanitized = (val: any) => (val === null ? undefined : val);

    // Pick first image if available
    const primaryImage = (row.image_urls && row.image_urls.length > 0)
      ? row.image_urls[0]
      : undefined; // EventData expects string | undefined for optional fields, or depends on interface

    return {
      id: row.id,
      source_id: row.source_id,
      title: row.title,
      summary: row.summary || '',
      imageUrl: primaryImage, // Match interface

      start: {
        year: startEntry.year ?? Math.floor(row.start_astro_year),
        month: sanitized(startEntry.month),
        day: sanitized(startEntry.day),
        hour: sanitized(startEntry.hour),
        minute: sanitized(startEntry.minute),
        second: sanitized(startEntry.second),
        millisecond: sanitized(startEntry.millisecond),
        astro_year: row.start_astro_year,
        precision: startEntry.precision || 'year'
      },

      end: endEntry ? {
        year: endEntry.year ?? Math.floor(row.end_astro_year),
        month: sanitized(endEntry.month),
        day: sanitized(endEntry.day),
        hour: sanitized(endEntry.hour),
        minute: sanitized(endEntry.minute),
        second: sanitized(endEntry.second),
        millisecond: sanitized(endEntry.millisecond),
        astro_year: row.end_astro_year,
        precision: endEntry.precision || 'year'
      } : undefined,

      location: {
        lat: row.lat,
        lng: row.lng,
        placeName: sanitized(row.place_name),
        granularity: sanitized(row.granularity),
        certainty: sanitized(row.certainty),
        regionId: sanitized(row.geo_shape_id),
        areaId: sanitized(row.area_id),
      },

      importance: Number(row.importance) || 1.0,

      collections: row.collections || [],

      sources: row.links || [],

      children: row.child_source_ids || [],

      pipeline: row.pipeline
    };
  });

  return NextResponse.json(formattedEvents, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
    }
  });
}