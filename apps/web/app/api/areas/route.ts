/**
 * app/api/areas/route.ts
 * 
 * Fetches semantic area definitions (including geometry) by ID.
 */

import { createServiceClient } from '../../../lib/supabase';
import { NextResponse } from 'next/server';



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json({ error: "Missing 'ids' parameter" }, { status: 400 });
  }

  const areaIds = idsParam.split(',').map(s => s.trim()).filter(s => s.length > 0);

  if (areaIds.length === 0) {
    return NextResponse.json([], { status: 200 }); // Empty request
  }

  // [NEW] Dataset Switcher (Prod/Dev)
  const dataset = searchParams.get('dataset') || 'prod';
  let targetSchema = 'prod';
  if (dataset === 'dev') targetSchema = 'dev';
  if (dataset === 'staging') targetSchema = 'staging';

  const supabase = createServiceClient(targetSchema);

  // Call the RPC (Same name for all schemas now!)
  const rpcName = 'get_areas_by_ids';

  const { data, error } = await supabase.rpc(rpcName, {
    area_ids_input: areaIds
  });

  if (error) {
    console.error('get_areas_by_ids RPC Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || [], {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' // Cache for 1 hour
    }
  });
}
