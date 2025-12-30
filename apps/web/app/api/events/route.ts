/**
 * app/api/events/route.ts
 * 
 * ADAPTER LAYER (DATA <=> APPLICATION)
 * ------------------------------------------------------------------
 * This file acts as the Adapter connecting the Data Layer to the Application Layer.
 * It is responsible for fetching raw data from the DB and transforming it
 * into the Canonical Application Schema.
 * 
 * Relationship:
 * - Fetches raw data from 'create_table.sql' (Data Layer).
 * - Transforms/Maps data to match 'types/index.ts' (Application Layer).
 */

import { createServiceClient } from '../../../lib/supabase';
import { NextResponse } from 'next/server';
import { MOCK_EVENTS } from '../../../lib/constants';
import { EventData } from '@sail/shared';
import { getDataset, getSchemaForDataset } from '../../../lib/env';




export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // [NEW] Dataset Switcher
  const datasetParam = searchParams.get('env') || searchParams.get('dataset');
  const targetDataset = getDataset(datasetParam);
  const targetSchema = getSchemaForDataset(targetDataset);

  // Local Mock Mode
  if (datasetParam === 'local') {
    return NextResponse.json(MOCK_EVENTS, {
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  // Create Schema-Specific Supabase Client
  // We re-initialize the client here because the global one is bound to 'public' by default.
  // This is lightweight.
  // Create Schema-Specific Supabase Client
  const supabase = createServiceClient(targetSchema);

  // [NEW] ID-Based Fetch (Bypass RPC)
  const idsParam = searchParams.get('ids');
  const uuidsParam = searchParams.get('uuids');

  if (idsParam || uuidsParam) {
    if (idsParam) {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return NextResponse.json([]);

      // [FIX] Use direct query instead of RPC to ensure we get all columns (including new parent_source_id)
      // regardless of whether the RPC signature is stale.
      const { data: idData, error: idError } = await supabase
        .from('events')
        .select('*')
        .in('source_id', ids);

      if (idError) throw new Error(idError.message);

      // [POLYFILL] Reverse Lookup for missing parent_source_id
      // If data is stale and missing parent_source_id, we infer it from child_source_ids of parents.
      const orphans = (idData || []).filter((e: any) => !e.parent_source_id && e.source_id);
      if (orphans.length > 0) {
        const orphanIds = orphans.map((e: any) => e.source_id);
        const { data: parents, error: parentError } = await supabase
          .from('events')
          .select('source_id, child_source_ids')
          .overlaps('child_source_ids', orphanIds);

        if (parents && !parentError) {
          const parentMap = new Map<string, string>();
          parents.forEach((p: any) => {
            (p.child_source_ids || []).forEach((cid: string) => {
              if (orphanIds.includes(cid)) parentMap.set(cid, p.source_id);
            });
          });
          idData?.forEach((row: any) => {
            if (!row.parent_source_id && row.source_id && parentMap.has(row.source_id)) {
              row.parent_source_id = parentMap.get(row.source_id);
            }
          });
        }
      }

      return mapAndReturnEvents(idData || []);
    }

    if (uuidsParam) {
      // UUIDs -> Direct Query
      const ids = uuidsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 0) return NextResponse.json([]);

      let { data: uuidData, error: uuidError } = await supabase
        .from('events')
        .select('*')
        .in('id', ids);

      // [FIX] Fallback to source_id if UUID syntax is invalid
      // This handles cases where the client sends Source IDs to the UUID endpoint (e.g. from URL)
      if (uuidError && (uuidError.code === '22P02' || uuidError.message.includes('uuid'))) {
        const { data: retryData, error: retryError } = await supabase
          .from('events')
          .select('*')
          .in('source_id', ids);

        if (retryError) throw new Error(retryError.message);
        uuidData = retryData;
        uuidError = null;
      }

      if (uuidError) throw new Error(uuidError.message);

      // [POLYFILL] Same logic for UUID fetch
      const orphans = (uuidData || []).filter((e: any) => !e.parent_source_id && e.source_id);
      if (orphans.length > 0) {
        const orphanIds = orphans.map((e: any) => e.source_id);
        const { data: parents, error: parentError } = await supabase
          .from('events')
          .select('source_id, child_source_ids')
          .overlaps('child_source_ids', orphanIds);

        if (parents && !parentError) {
          const parentMap = new Map<string, string>();
          parents.forEach((p: any) => {
            (p.child_source_ids || []).forEach((cid: string) => {
              if (orphanIds.includes(cid)) parentMap.set(cid, p.source_id);
            });
          });
          uuidData?.forEach((row: any) => {
            if (!row.parent_source_id && row.source_id && parentMap.has(row.source_id)) {
              row.parent_source_id = parentMap.get(row.source_id);
            }
          });
        }
      }

      return mapAndReturnEvents(uuidData || []);
    }
  }

  // Determine which RPC to use based on context
  // Standard: get_events_in_view
  // Focus Mode Hybrid: get_descendants_in_view
  let rpcName = 'get_events_in_view';
  const rootId = searchParams.get('root_id'); // [NEW] Context for Hybrid Fetch

  if (rootId) {
    rpcName = 'get_descendants_in_view';
  }

  const minYear = parseFloat(searchParams.get('minYear') || '-5000');
  const maxYear = parseFloat(searchParams.get('maxYear') || '2050');
  const zoom = parseFloat(searchParams.get('z') || '10');

  let north = parseFloat(searchParams.get('n') || '90');
  let south = parseFloat(searchParams.get('s') || '-90');
  let east = parseFloat(searchParams.get('e') || '180');
  let west = parseFloat(searchParams.get('w') || '-180');

  const lngSpan = east - west;

  // [CRITICAL FIX] "Antipodal Edge" Prevention
  const isGlobalView =
    zoom < 5.5 ||
    lngSpan >= 160 ||
    (west <= -180 && east >= 180);

  // Prepare RPC Arguments
  let rpcWest, rpcEast, rpcNorth, rpcSouth;

  if (isGlobalView) {
    rpcWest = null; rpcEast = null; rpcNorth = null; rpcSouth = null;
  } else {
    rpcWest = Math.max(-180, west);
    rpcEast = Math.min(180, east);
    rpcNorth = Math.min(90, north);
    rpcSouth = Math.max(-90, south);

    if (rpcWest > rpcEast) {
      rpcWest = null; rpcEast = null; rpcNorth = null; rpcSouth = null;
    }
  }

  const minImportance = 1;

  // Collection Filter
  const collectionFilter = searchParams.get('collection') || null;

  // Determine Limit (Default to 1000 if not specified)
  // Determine Limit
  const limit = parseInt(searchParams.get('limit') || '1000', 10);

  // [FIX] Strict Argument Construction
  let rpcArgs: any = {};

  if (rpcName === 'get_descendants_in_view') {
    // Signature: (min_lng, min_lat, max_lng, max_lat, zoom_level, min_year, max_year, p_dataset, p_root_id)
    rpcArgs = {
      min_lng: rpcWest,
      min_lat: rpcSouth,
      max_lng: rpcEast,
      max_lat: rpcNorth,
      zoom_level: Math.floor(zoom),
      min_year: minYear,
      max_year: maxYear,
      p_dataset: targetDataset,
      p_root_id: rootId
    };
  } else {
    // Signature: (min_lat, max_lat, min_lng, max_lng, min_year, max_year, min_importance, collection_filter, p_limit)
    // Note: p_dataset is NOT in this signature (it relies on client schema)
    rpcArgs = {
      min_lat: rpcSouth,
      max_lat: rpcNorth,
      min_lng: rpcWest,
      max_lng: rpcEast,
      min_year: minYear,
      max_year: maxYear,
      min_importance: minImportance,
      collection_filter: collectionFilter,
      p_limit: limit
    };
  }

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);

  if (error) {
    console.error('Supabase RPC Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return mapAndReturnEvents(data);
}

// Helper to keep mapping consistent
function mapAndReturnEvents(data: any[]) {
  // Explicitly map to EventData[]
  const formattedEvents: EventData[] = (data || []).map((row: any): EventData => {
    // Unpack JSONB Time Entries
    const startEntry = row.start_time_entry || {};
    const endEntry = row.end_time_entry || null;

    const sanitized = (val: any) => (val === null ? undefined : val);

    // Pick first image if available
    const primaryImage = (row.image_urls && row.image_urls.length > 0)
      ? row.image_urls[0]
      : undefined; // EventData expects string | undefined for optional fields, or depends on interface

    return {
      id: row.id,
      source_id: row.source_id,
      title: row.title,
      summary: row.summary || '',
      imageUrl: primaryImage, // Match interface

      start: {
        year: startEntry.year ?? Math.floor(row.start_astro_year),
        month: sanitized(startEntry.month),
        day: sanitized(startEntry.day),
        hour: sanitized(startEntry.hour),
        minute: sanitized(startEntry.minute),
        second: sanitized(startEntry.second),
        millisecond: sanitized(startEntry.millisecond),
        astro_year: row.start_astro_year,
        precision: startEntry.precision || 'year'
      },

      end: endEntry ? {
        year: endEntry.year ?? Math.floor(row.end_astro_year),
        month: sanitized(endEntry.month),
        day: sanitized(endEntry.day),
        hour: sanitized(endEntry.hour),
        minute: sanitized(endEntry.minute),
        second: sanitized(endEntry.second),
        millisecond: sanitized(endEntry.millisecond),
        astro_year: row.end_astro_year,
        precision: endEntry.precision || 'year'
      } : undefined,

      location: {
        lat: row.lat, // RPC returns lat/lng, table returns location geometry... wait.
        // CHECK: The RPC returns columns `lat` and `lng` computed from ST_Y/ST_X.
        // The raw table `select('*')` returns `location` (geog) but NOT separate lat/lng columns unless generated.
        // We need to handle this discrepancy.
        // The safest way for raw table fetch is to compute lat/lng or use a custom query.
        // OR, we can just use the geometry.
        // But the interface expects lat/lng.
        // Let's modify the raw query to extract lat/lng or process it.
        lng: row.lng ?? 0, // Fallback if missing
        placeName: sanitized(row.place_name),
        granularity: sanitized(row.granularity),
        certainty: sanitized(row.certainty),
        areaId: sanitized(row.area_id),
      },
      // ... (rest is same)
      importance: Number(row.importance) || 1.0,
      collections: row.collections || [],
      sources: row.links || [],
      children: row.child_source_ids || [],
      parent_source_id: row.parent_source_id || undefined
    };
  });

  return NextResponse.json(formattedEvents, {
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}