import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getDbSchema } from '@/lib/db';

// Initialize Supabase Client (Server-Side)
// We prefer the Service Role key for CMS to bypass RLS.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dataset = searchParams.get('dataset') || 'prod';
    const status = searchParams.get('status');

    const schema = getDbSchema(dataset);
    const db = supabase.schema(schema);

    console.log(`[CMS Feedback API] Fetching from Schema: ${schema}, dataset: ${dataset}, status: ${status}`);

    let query = db
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CMS Feedback API] Supabase Error:', error);
      throw error;
    }

    console.log(`[CMS Feedback API] Found ${data?.length || 0} items`);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('[CMS Feedback API] GET Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, dataset, status } = body;

    if (!id || !dataset || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const schema = getDbSchema(dataset);
    const db = supabase.schema(schema);

    const { data, error } = await db
      .from('feedback')
      .update({ status })
      .eq('id', id)
      .select();

    if (error) throw error;

    return NextResponse.json(data[0]);
  } catch (e: any) {
    console.error('[CMS Feedback API] PATCH Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
