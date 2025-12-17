import { useState, useEffect } from 'react';

export function useAreaShape(areaId: string | undefined) {
  const [shape, setShape] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!areaId) {
      setShape(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // Simple cache key check could go here if we had a global cache

    fetch(`/api/areas?ids=${encodeURIComponent(areaId)}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch area");
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        if (data && data.length > 0) {
          // The DB returns a geometry column in the object
          // PostGIS returning GeoJSON directly or as WKB?
          // "geometry" column in `areas` is `geography(MultiPolygon, 4326)`.
          // Supabase/PostgREST usually returns GeoJSON for geometry columns if requested or configured?
          // Actually, usually it returns WKB string or GeoJSON object depending on header.
          // But wait, the previous `populate_areas` inserted using WKT.
          // Let's verify what Supabase RPC returns. 
          // Typically supabase-js handles JSON conversion. 
          // If the column is `geography`, Supabase (PostgREST) returns it as GeoJSON by default if Accept header is application/geo+json, 
          // OR if we cast it in SQL.
          // The `bulk_import` used ST_GeogFromText for insert.
          // The RPC `get_areas_by_ids` does `SELECT *`.
          // PostgREST typically serves `geometry`/`geography` columns as GeoJSON objects.
          setShape(data[0].geometry);
        } else {
          setShape(null);
        }
      })
      .catch(err => {
        if (isMounted) setError(err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [areaId]);

  return { shape, isLoading, error };
}
