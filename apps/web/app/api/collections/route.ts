import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset') || 'prod';

  // Decide which RPC to call
  const rpcName = dataset === 'dev' ? 'get_all_collections_dev' : 'get_all_collections';

  const { data, error } = await supabase.rpc(rpcName);

  if (error) {
    console.error('Supabase RPC Error (get_all_collections):', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // data is expected to be an array of objects: [{ collection: "name" }, ...]
  const collections = (data || []).map((row: any) => row.collection);

  return NextResponse.json(collections, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600'
    }
  });
}
