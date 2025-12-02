import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase client (using environment variables)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // 1. Parse query parameters (with defaults)
  const minYear = parseInt(searchParams.get('minYear') || '-5000');
  const maxYear = parseInt(searchParams.get('maxYear') || '2050');
  
  // Get raw coordinates
  let north = parseFloat(searchParams.get('n') || '90');
  let south = parseFloat(searchParams.get('s') || '-90');
  let east = parseFloat(searchParams.get('e') || '180');
  let west = parseFloat(searchParams.get('w') || '-180');
  
  // 2. [CRITICAL FIX] Coordinate Normalization
  // Leaflet allows panning "around the world" (e.g., west: -250, east: 110), 
  // or zooming out to see multiple worlds (e.g., -180 to 540).
  // PostGIS geography types require coordinates within [-180, 180].
  
  const lngSpan = east - west;
  
  // If the viewport spans the entire globe (or more), force full boundaries
  if (lngSpan >= 360) {
      west = -180;
      east = 180;
  } else {
      // Clamp to -180/180 to prevent PostGIS lookup failures
      // Note: Simplified handling for date-line crossing, sufficient for MVP
      west = Math.max(-180, west);
      east = Math.min(180, east);
      
      // If clamping results in inverted bounds (west > east), reset to full world
      // This happens if the user was looking completely "off-chart"
      if (west > east) {
          west = -180;
          east = 180;
      }
  }
  
  // 3. Latitude Clamping
  north = Math.min(90, north);
  south = Math.max(-90, south);

  // We fetch events of all importance levels to calculate density map
  // The database limits the total count to prevent overload
  const minImportance = 1; 

  // 4. Call Database RPC Function
  const { data, error } = await supabase
    .rpc('get_events_in_view', {
       min_lat: south,
       max_lat: north,
       min_lng: west,
       max_lng: east,
       min_year: minYear,
       max_year: maxYear,
       min_importance: minImportance
    });

  if (error) {
    console.error('Supabase RPC Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 5. Data Sanitization: Convert DB snake_case to frontend camelCase
  // Must strictly match EventData interface in types/index.ts
  const formattedEvents = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    imageUrl: row.image_url,
    // Note: The 'precision' field in DB is already the string format we want
    start: { year: row.start_year, precision: row.precision || 'year' },
    location: {
      lat: row.lat,
      lng: row.lng,
      placeName: row.place_name,
      granularity: row.granularity,
      certainty: row.certainty,
      regionId: row.region_id
    },
    importance: row.importance,
    sources: row.sources || []
  }));

  // 6. Return JSON with CDN Cache Headers (Critical Performance Optimization)
  // s-maxage=60: Cache in public CDN for 60 seconds
  // stale-while-revalidate=600: Allow serving stale data for 10 minutes while re-fetching in background
  return NextResponse.json(formattedEvents, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
    }
  });
}