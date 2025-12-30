import { createServiceClient } from '../../../lib/supabase';
import { NextResponse } from 'next/server';
import { getDataset, getSchemaForDataset } from '../../../lib/env';



export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const datasetParam = searchParams.get('dataset');
  const targetDataset = getDataset(datasetParam);
  const targetSchema = getSchemaForDataset(targetDataset);

  const supabase = createServiceClient(targetSchema);

  // Constant RPC name
  const rpcName = 'get_all_collections';

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
