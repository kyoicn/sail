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
  const rpcName = dataset === 'dev' ? 'get_events_in_view_dev' : 'get_events_in_view_v2';

  const minYear = parseFloat(searchParams.get('minYear') || '-5000');
  const maxYear = parseFloat(searchParams.get('maxYear') || '2050');
  const zoom = parseFloat(searchParams.get('z') || '10');

  let north = parseFloat(searchParams.get('n') || '90');
  let south = parseFloat(searchParams.get('s') || '-90');
  let east = parseFloat(searchParams.get('e') || '180');
  let west = parseFloat(searchParams.get('w') || '-180');

  const lngSpan = east - west;

  // [CRITICAL FIX] "Antipodal Edge" Prevention
  // PostGIS throws "Antipodal (180 degrees long) edge detected" if we try to make 
  // a polygon that spans >= 180 degrees.
  // Instead of trying to clamp coordinates to 179.9, we should just disable spatial 
  // filtering entirely for any large view.
  //
  // New Logic: 
  // 1. Zoom < 5.5 (Continents/World) -> Global View
  // 2. Longitude Span > 160 degrees -> Global View (Safe margin before 180)
  // 3. Off-map coordinates -> Global View
  const isGlobalView =
    zoom < 5.5 ||
    lngSpan >= 160 ||  // Reduced from 300 to 160 to be super safe against Antipodal errors
    (west <= -180 && east >= 180);

  // Prepare RPC Arguments
  let rpcWest, rpcEast, rpcNorth, rpcSouth;

  if (isGlobalView) {
    // Pass NULL to trigger SQL short-circuit (no spatial check)
    rpcWest = null;
    rpcEast = null;
    rpcNorth = null;
    rpcSouth = null;
  } else {
    // Local View: Safe to use exact bounds because we know span < 160
    rpcWest = Math.max(-180, west);
    rpcEast = Math.min(180, east);
    rpcNorth = Math.min(90, north);
    rpcSouth = Math.max(-90, south);

    // Safety fix
    if (rpcWest > rpcEast) {
      // If clamping broke the bounds, just fallback to global
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
    const startBody = row.start_time_body || {};

    return {
      id: row.id,
      source_id: row.source_id,
      title: row.title,
      summary: row.summary,
      imageUrl: row.image_url,

      start: {
        year: startBody.year ?? row.start_year,
        month: startBody.month,
        day: startBody.day,
        hour: startBody.hour,
        minute: startBody.minute,
        second: startBody.second,
        millisecond: startBody.millisecond,
        astro_year: row.start_astro_year ?? row.start_year,
        precision: row.precision || 'year'
      },

      location: {
        lat: row.lat,
        lng: row.lng,
        placeName: row.place_name,
        granularity: row.granularity,
        certainty: row.certainty,
        region_id: row.region_id,
      },

      importance: row.importance,
      sources: row.sources || [],

      pipeline: row.pipeline
    };
  });

  return NextResponse.json(formattedEvents, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
    }
  });
}