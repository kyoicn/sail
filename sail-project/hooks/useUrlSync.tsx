import { useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface UrlState {
  lat: number;
  lng: number;
  zoom: number;
  year: number;
  span: number;
}

/**
 * useUrlSync Hook
 * Manages two-way synchronization between the application state and the URL query parameters.
 * Uses debouncing to prevent excessive history entries during continuous interactions (like dragging).
 */
export function useUrlSync(
  defaultState: UrlState,
  delay: number = 500
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      const params = new URLSearchParams(searchParams?.toString());
      
      params.set('lat', newState.lat.toFixed(4));
      params.set('lng', newState.lng.toFixed(4));
      params.set('z', newState.zoom.toString());
      params.set('y', newState.year.toFixed(1));
      params.set('s', newState.span.toFixed(0));

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, delay);
  }, [pathname, router, searchParams, delay]);

  return { getInitialState, updateUrl };
}