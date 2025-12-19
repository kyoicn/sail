import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase Client (Server-Side)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const dataset = searchParams.get('dataset') || 'prod';

    // Determine Table and RPC names based on dataset
    let tableName = 'areas';
    let rpcName = 'get_areas_by_ids';

    if (dataset === 'dev') {
      tableName = 'areas_dev';
      rpcName = 'get_areas_by_ids_dev';
    } else if (dataset === 'staging') {
      tableName = 'areas_staging';
      rpcName = 'get_areas_by_ids_staging';
    }

    // 1. DETAIL MODE: Fetch single area with Geometry via RPC
    if (id) {
      const { data, error } = await supabase.rpc(rpcName, {
        area_ids_input: [id]
      });

      if (error) throw error;

      const area = data && data[0] ? data[0] : null;
      return NextResponse.json(area);
    }

    // 2. LIST MODE: Fetch list without Geometry (Lightweight)
    const limit = parseInt(searchParams.get('limit') || '100');
    const { data, error } = await supabase
      .from(tableName)
      .select('id, area_id, display_name')
      .limit(limit);

    if (error) {
      console.error('Supabase Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e: any) {
    console.error('SERVER ERROR:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
