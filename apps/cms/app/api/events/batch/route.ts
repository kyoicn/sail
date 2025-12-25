import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getDbSchema } from '@/lib/db';
import { EventData, ChronosTime, ChronosLocation } from '@sail/shared';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { events, dataset = 'dev' } = await request.json(); // Default to dev environment for safety

    if (!events || !Array.isArray(events)) {
      return NextResponse.json({ error: 'Invalid events payload' }, { status: 400 });
    }

    const schema = getDbSchema(dataset);
    const db = supabase.schema(schema);

    // Map EventData to DB Schema (snake_case)
    // DB Schema typically: id, title, summary, start_year, start_astro_year, lat, lng, importance, etc.
    // I need to check the DB schema. Assuming standard fields based on EventData properties.
    // IMPORTANT: db.ts suggests 'events' table.

    // We strictly map properties.
    const rows = events.map((e: EventData) => ({
      // id: e.id, // Let DB generate ID if UUID or use provided? Usually Let DB or ensure UUID.
      // E.g. if we want to upsert, we might need ID. But here we probably insert new.
      // If ID is provided and we want to insert new, we might iterate or upsert.
      // For this feature, "Submit to DB" usually means create new records.

      title: e.title,
      summary: e.summary,
      importance: e.importance,
      source_id: e.source_id || `cms:${Date.now()}:${Math.random().toString(36).substring(7)}`,

      // Time (Start)
      start_year: e.start.year,
      start_astro_year: e.start.astro_year,
      start_month: e.start.month,
      start_day: e.start.day,
      start_time_precision: e.start.precision,

      // Time (End)
      end_year: e.end?.year,
      end_astro_year: e.end?.astro_year,

      // Location
      lat: e.location.lat,
      lng: e.location.lng,
      location_name: e.location.placeName,
      location_precision: e.location.granularity,

      // Metadata
      collections: e.collections || [],
      // sources: e.sources // If DB has JSONB sources column
    }));

    const { data, error } = await db
      .from('events')
      .insert(rows)
      .select();

    if (error) {
      console.error("Supabase Insert Error", error);
      throw error;
    }

    return NextResponse.json({ success: true, count: data.length, ids: data.map((d: any) => d.id) });

  } catch (error: any) {
    console.error('Batch Save Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
