import { useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

interface UrlState {
  lat: number;
  lng: number;
  zoom: number;
  year: number;
  start: number;
  end: number;
  focus?: string | null;
  mode?: string;
  playing?: boolean;
}

export function useUrlSync(
  defaultState: UrlState,
  delay: number = 300
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

    const parseParam = (key: string, type: 'float' | 'int' | 'string' | 'bool', defaultValue: any) => {
      const val = searchParams.get(key);
      if (val === null || val === '') return defaultValue;
      if (type === 'float') return parseFloat(val);
      if (type === 'int') return parseInt(val);
      if (type === 'bool') return val === '1' || val === 'true';
      return val;
    };

    const lat = parseParam('lat', 'float', defaultState.lat);
    const lng = parseParam('lng', 'float', defaultState.lng);
    const zoom = parseParam('z', 'int', defaultState.zoom);
    const year = parseParam('year', 'float', defaultState.year);
    const start = parseParam('start', 'float', defaultState.start);
    const end = parseParam('end', 'float', defaultState.end);
    const focus = parseParam('focus', 'string', defaultState.focus || null);
    const mode = parseParam('m', 'string', defaultState.mode || 'exploration');
    const playing = parseParam('play', 'bool', defaultState.playing || false);

    return { lat, lng, zoom, year, start, end, focus, mode, playing };
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
      newParams.set('year', newState.year.toFixed(1));
      newParams.set('start', newState.start.toFixed(1));
      newParams.set('end', newState.end.toFixed(1));

      if (newState.focus) {
        newParams.set('focus', newState.focus);
      } else {
        newParams.delete('focus');
      }

      if (newState.mode && newState.mode !== 'exploration') {
        newParams.set('m', newState.mode);
      } else {
        newParams.delete('m');
      }

      if (newState.playing) {
        newParams.set('play', '1');
      } else {
        newParams.delete('play');
      }

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