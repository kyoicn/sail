import { useState, useEffect } from 'react';

export function useAreaShape(areaId: string | undefined, dataset: string = 'prod') {
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

    // [MODIFIED] Pass dataset param
    fetch(`/api/areas?ids=${encodeURIComponent(areaId)}&dataset=${dataset}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch area");
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        if (data && data.length > 0) {
          console.log('[useAreaShape] Fetched Shape:', data[0].area_id, data[0].geometry);
          setShape(data[0].geometry);
        } else {
          console.log('[useAreaShape] No shape found for:', areaId);
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
  }, [areaId, dataset]);

  return { shape, isLoading, error };
}
