import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getTableName, getRpcName } from '@/lib/db';

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
    const tableName = getTableName('areas', dataset);
    const rpcName = getRpcName('get_areas_by_ids', dataset);

    // 1. DETAIL MODE: Fetch single area with Geometry via RPC
    if (id) {
      const { data, error } = await supabase.rpc(rpcName, {
        area_ids_input: [id]
      });

      if (error) throw error;

      const area = data && data[0] ? data[0] : null;

      if (area) {
        // Fetch Associated Periods
        // We need to resolve the correct table names with suffixes
        // Fetch Associated Periods
        // Refactored to use shared utility
        const tablePeriodAreas = getTableName('period_areas', dataset);
        const tableHistoricalPeriods = getTableName('historical_periods', dataset);

        // 1. Get the links (period_id (uuid), role)
        const { data: links, error: linkError } = await supabase
          .from(tablePeriodAreas)
          .select('period_id, role')
          .eq('area_id', area.id);

        if (linkError) {
          console.warn('Error fetching period links:', linkError);
        } else if (links && links.length > 0) {
          // 2. Get the period details
          const periodTypeIds = links.map(l => l.period_id);
          const { data: periodDetails, error: periodError } = await supabase
            .from(tableHistoricalPeriods)
            .select('id, period_id, display_name, start_astro_year, end_astro_year')
            .in('id', periodTypeIds);

          if (periodError) {
            console.warn('Error fetching period details:', periodError);
          } else {
            // Merge
            area.periods = periodDetails?.map(p => {
              const link = links.find(l => l.period_id === p.id);
              return {
                period_id: p.period_id, // slug
                display_name: p.display_name,
                role: link?.role || 'primary',
                start_year: p.start_astro_year,
                end_year: p.end_astro_year
              };
            });
          }
        } else {
          area.periods = [];
        }
      }

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
