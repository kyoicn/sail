import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const minYear = parseInt(searchParams.get('minYear') || '-5000');
  const maxYear = parseInt(searchParams.get('maxYear') || '2050');
  const zoom = parseFloat(searchParams.get('z') || '10');
  
  let north = parseFloat(searchParams.get('n') || '90');
  let south = parseFloat(searchParams.get('s') || '-90');
  let east = parseFloat(searchParams.get('e') || '180');
  let west = parseFloat(searchParams.get('w') || '-180');
  
  const lngSpan = east - west;

  // 1. Determine "Global Mode"
  // Logic: Zoom is small (continents) OR viewport spans the whole world.
  const isGlobalView = zoom < 5.5 || lngSpan >= 300 || (west <= -180 && east >= 180);

  // 2. Prepare RPC Arguments
  // [ELEGANT FIX] Instead of clamping to -179.9, we pass NULL for global view.
  // The SQL function handles NULL by skipping the spatial check entirely.
  // This is mathematically correct (Global = No Filter) and avoids edge errors.
  
  let rpcArgs;

  if (isGlobalView) {
      // Global View: Pass NULLs to disable spatial filtering
      rpcArgs = {
          min_lat: null,
          max_lat: null,
          min_lng: null,
          max_lng: null,
          min_year: minYear,
          max_year: maxYear,
          min_importance: 1
      };
  } else {
      // Local View: Clamp to valid PostGIS bounds [-180, 180]
      let safeWest = Math.max(-180, west);
      let safeEast = Math.min(180, east);
      const safeNorth = Math.min(90, north);
      const safeSouth = Math.max(-90, south);
      
      // Handle edge case where view is completely off-chart
      if (safeWest > safeEast) {
          safeWest = -180;
          safeEast = 180;
      }

      rpcArgs = {
          min_lat: safeSouth,
          max_lat: safeNorth,
          min_lng: safeWest,
          max_lng: safeEast,
          min_year: minYear,
          max_year: maxYear,
          min_importance: 1
      };
  }

  // 3. Execute RPC
  const { data, error } = await supabase.rpc('get_events_in_view', rpcArgs);

  if (error) {
    console.error('Supabase RPC Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 4. Format Data
  const formattedEvents = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    imageUrl: row.image_url,
    start: { year: row.start_year, precision: row.precision || 'year' },
    location: {
      lat: row.lat, 
      lng: row.lng,
      placeName: row.place_name,
      granularity: row.granularity,
      certainty: row.certainty,
      region_id: row.region_id
    },
    importance: row.importance,
    sources: row.sources || []
  }));

  return NextResponse.json(formattedEvents, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
    }
  });
}