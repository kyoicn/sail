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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // [NEW] Dataset Switcher
  // Defaults to 'prod' (events table).
  // Can be overridden by ?dataset=dev or ?dataset=local
  const dataset = searchParams.get('dataset') || 'prod';

  // Local Mode: Return mock data directly (No DB call)
  if (dataset === 'local') {
    return NextResponse.json(MOCK_EVENTS, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  // Decide which RPC to call
  // 'prod' -> 'get_events_in_view' (The new standard RPC)
  // 'dev'  -> 'get_events_in_view_dev' (The dev RPC)
  const rpcName = dataset === 'dev' ? 'get_events_in_view_dev' : 'get_events_in_view';

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

  const { data, error } = await supabase.rpc(rpcName, {
    min_lat: rpcSouth,
    max_lat: rpcNorth,
    min_lng: rpcWest,
    max_lng: rpcEast,
    min_year: minYear,
    max_year: maxYear,
    min_importance: minImportance
  });

  if (error) {
    console.error('Supabase RPC Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formattedEvents = (data || []).map((row: any) => {
    // Unpack JSONB Time Entries
    const startEntry = row.start_time_entry || {};
    const endEntry = row.end_time_entry || null;

    const sanitized = (val: any) => (val === null ? undefined : val);

    // Pick first image if available
    const primaryImage = (row.image_urls && row.image_urls.length > 0)
      ? row.image_urls[0]
      : '';

    return {
      id: row.id,
      source_id: row.source_id,
      title: row.title,
      summary: row.summary || '',
      imageUrl: primaryImage,

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
      },

      importance: Number(row.importance) || 1.0,

      sources: row.links || [],

      pipeline: row.pipeline
    };
  });

  return NextResponse.json(formattedEvents, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
    }
  });
}