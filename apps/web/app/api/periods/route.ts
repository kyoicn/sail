
import { createServiceClient } from '../../../lib/supabase';
import { NextResponse } from 'next/server';



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const min_lng = parseFloat(searchParams.get('min_lng') || '0');
  const min_lat = parseFloat(searchParams.get('min_lat') || '0');
  const max_lng = parseFloat(searchParams.get('max_lng') || '0');
  const max_lat = parseFloat(searchParams.get('max_lat') || '0');
  // Range-based query support
  // If `year` is provided, treat it as a point query (min=year, max=year)
  const queryYear = parseFloat(searchParams.get('year') || '0');
  const min_year = parseFloat(searchParams.get('min_year') || queryYear.toString());
  const max_year = parseFloat(searchParams.get('max_year') || queryYear.toString());

  const dataset = searchParams.get('dataset') || 'prod';

  let targetSchema = 'prod';
  if (dataset === 'dev') targetSchema = 'dev';
  if (dataset === 'staging') targetSchema = 'staging';

  // [NEW] Schema-Aware Client
  // Re-init client for specific schema
  // [NEW] Schema-Aware Client
  // Re-init client for specific schema
  const supabase = createServiceClient(targetSchema);

  // Constant RPC name, resolved relative to the selected schema
  const rpcName = 'get_active_periods';

  const { data, error } = await supabase.rpc(rpcName, {
    view_min_lng: min_lng,
    view_min_lat: min_lat,
    view_max_lng: max_lng,
    view_max_lat: max_lat,
    query_min_year: min_year,
    query_max_year: max_year
  });

  if (error) {
    console.error(`Error fetching active periods (${rpcName}):`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return top 3 periods
  const activePeriods = data ? data.slice(0, 3) : [];

  return NextResponse.json(activePeriods, {
    headers: {
      // Short cache to ensure responsiveness to movement
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
    }
  });
}
