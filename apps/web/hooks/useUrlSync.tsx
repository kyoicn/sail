import { useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface UrlState {
  lat: number;
  lng: number;
  zoom: number;
  year: number;
  span: number;
}

export function useUrlSync(
  defaultState: UrlState,
  delay: number = 1000 
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const getInitialState = (): UrlState => {
    if (!searchParams) return defaultState;
    const lat = parseFloat(searchParams.get('lat') || '') || defaultState.lat;
    const lng = parseFloat(searchParams.get('lng') || '') || defaultState.lng;
    const zoom = parseInt(searchParams.get('z') || '') || defaultState.zoom;
    const year = parseFloat(searchParams.get('y') || '') || defaultState.year;
    const span = parseFloat(searchParams.get('s') || '') || defaultState.span;
    return { lat, lng, zoom, year, span };
  };

  const updateUrl = useCallback((newState: UrlState) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      // 1. Construct the new params
      const currentParams = new URLSearchParams(searchParams?.toString());
      const newParams = new URLSearchParams(searchParams?.toString());
      
      newParams.set('lat', newState.lat.toFixed(4));
      newParams.set('lng', newState.lng.toFixed(4));
      newParams.set('z', newState.zoom.toString());
      newParams.set('y', newState.year.toFixed(1));
      newParams.set('s', newState.span.toFixed(0));

      // 2. [CRITICAL FIX] Dirty Check: Compare strings to avoid redundant updates
      // This breaks the infinite loop: State -> URL -> SearchParams -> Effect -> State
      if (currentParams.toString() === newParams.toString()) {
        return; // Stop here if nothing actually changed
      }

      // 3. Only replace if different
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
      
    }, delay);
  }, [pathname, router, searchParams, delay]);

  return { getInitialState, updateUrl };
}