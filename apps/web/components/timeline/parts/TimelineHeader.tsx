import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { formatNaturalDate, fromSliderValue, getMonthName } from '../../../lib/time-engine';
import { useActivePeriod } from '../../../hooks/useActivePeriod';
import { useAppConfig } from '../../../hooks/useAppConfig';
import { MapBounds } from '@sail/shared';

interface TimelineHeaderProps {
  interactionMode: 'exploration' | 'investigation' | 'playback';
  setInteractionMode: (mode: 'exploration' | 'investigation' | 'playback') => void;
  viewRange: { min: number, max: number };
  currentDate: number;
  setCurrentDate: (date: number) => void;
  mapBounds: MapBounds | null;
}

// Smart formatter to condense ranges
const formatSmartDateRange = (min: number, max: number): React.ReactNode => {
  const span = max - min;
  const start = fromSliderValue(min);
  const end = fromSliderValue(max);

  // Helper for single digit padding
  const pad = (n: number) => n.toString().padStart(2, '0');

  // Large Scale (Years)
  // If span > 1 year, just standard Year Era
  if (span >= 1) {
    return <span className="whitespace-nowrap">{start.year} {start.era} – {end.year} {end.era}</span>;
  }

  // Medium Scale (Months/Days) - Approx > 18 hours (0.002 years)
  if (span >= 0.002) {
    const sameEra = start.era === end.era;
    const sameYear = start.year === end.year && sameEra;
    const sameMonth = sameYear && start.details?.month === end.details?.month;

    if (sameMonth) {
      // "Jan 1 - 5, 1920 AD"
      return (
        <span className="whitespace-nowrap">
          {getMonthName(start.details!.month)} {start.details!.day} – {end.details!.day}, {start.year} {start.era}
        </span>
      );
    }
    if (sameYear) {
      // "Jan 1 - Feb 2, 1920 AD"
      return (
        <span className="whitespace-nowrap">
          {getMonthName(start.details!.month)} {start.details!.day} – {getMonthName(end.details!.month)} {end.details!.day}, {start.year} {start.era}
        </span>
      );
    }
    // "Dec 31, 1919 AD - Jan 1, 1920 AD"
    return (
      <>
        <span className="whitespace-nowrap">{getMonthName(start.details!.month)} {start.details!.day}, {start.year} {start.era}</span>
        {' – '}
        <span className="whitespace-nowrap">{getMonthName(end.details!.month)} {end.details!.day}, {end.year} {end.era}</span>
      </>
    );
  }

  // Small Scale (Time)
  const formatTime = (t: any, showSeconds = false) => {
    let s = `${pad(t.hour)}:${pad(t.minute)}`;
    if (showSeconds) s += `:${pad(t.second)}`;
    return s;
  };

  const sameEra = start.era === end.era;
  const sameYear = start.year === end.year && sameEra;
  const sameMonth = sameYear && start.details?.month === end.details?.month;
  const sameDay = sameMonth && start.details?.day === end.details?.day;

  // Granularity check
  const showSeconds = span < 0.000002; // < ~1 min

  if (sameDay) {
    // "Feb 2, 1897 AD, 10:35 - 12:56"
    return (
      <>
        <span className="whitespace-nowrap">
          {getMonthName(start.details!.month)} {start.details!.day}, {start.year} {start.era},
        </span>
        {' '}
        <span className="whitespace-nowrap">
          {formatTime(start.details, showSeconds)} – {formatTime(end.details, showSeconds)}
        </span>
      </>
    );
  }

  // Fallback for crossing midnight but close
  return (
    <>
      <span className="whitespace-nowrap">
        {getMonthName(start.details!.month)} {start.details!.day}, {formatTime(start.details, showSeconds)}
      </span>
      {' – '}
      <span className="whitespace-nowrap">
        {getMonthName(end.details!.month)} {end.details!.day}, {formatTime(end.details, showSeconds)}, {start.year} {start.era}
      </span>
    </>
  );
};

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  interactionMode,
  setInteractionMode,
  viewRange,
  currentDate,
  setCurrentDate,
  mapBounds
}) => {
  const { dataset } = useAppConfig();

  // Calculate query range based on mode
  const queryMinYear = interactionMode === 'exploration' ? viewRange.min : currentDate;
  const queryMaxYear = interactionMode === 'exploration' ? viewRange.max : currentDate;

  // Calculate focused bounds (center 50% of the viewport) to reduce noise
  const focusedBounds = useMemo(() => {
    if (!mapBounds) return null;
    const latSpan = mapBounds.north - mapBounds.south;
    const lngSpan = mapBounds.east - mapBounds.west;
    const factor = 0.5;

    const centerLat = (mapBounds.north + mapBounds.south) / 2;
    const centerLng = (mapBounds.east + mapBounds.west) / 2;

    return {
      north: centerLat + (latSpan * factor) / 2,
      south: centerLat - (latSpan * factor) / 2,
      east: centerLng + (lngSpan * factor) / 2,
      west: centerLng - (lngSpan * factor) / 2
    };
  }, [mapBounds]);

  const { activePeriods } = useActivePeriod(focusedBounds, queryMinYear, queryMaxYear, dataset);

  // Shared subtitle container class for height stability (min-height instead of fixed)
  const subtitleClass = "min-h-6 flex items-center justify-start gap-2 mt-2 flex-wrap";

  // Determine display text based on mode
  const headerText = interactionMode === 'exploration'
    ? formatSmartDateRange(viewRange.min, viewRange.max)
    : formatNaturalDate(currentDate, viewRange.max - viewRange.min);

  const showRangeSubtitle = interactionMode === 'investigation';
  const rangeSubtitle = (
    <>View: {formatSmartDateRange(viewRange.min, viewRange.max)}</>
  );

  // [Animation] Measure overflow to trigger ping-pong scroll
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollContentRef = React.useRef<HTMLDivElement>(null);
  const [overflowAmount, setOverflowAmount] = React.useState(0);

  React.useEffect(() => {
    if (!scrollContainerRef.current || !scrollContentRef.current) return;
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;

    // Check overflow
    const overflow = content.scrollWidth - container.clientWidth;
    setOverflowAmount(overflow > 0 ? overflow : 0);
  }, [activePeriods, rangeSubtitle, interactionMode]); // Re-run when content changes

  return (
    <div className="flex flex-col items-start w-full">
      {/* Header Text - Fixed h-20 to match Main Track height exactly */}
      <div className="flex items-start gap-2 h-20 w-full pt-0.5">
        {interactionMode !== 'exploration' && (
          <button
            onClick={() => setInteractionMode('exploration')}
            className="group flex items-center justify-center p-1.5 bg-white/10 hover:bg-white/20 border border-white/10 hover:border-blue-400/50 text-white/90 hover:text-blue-400 rounded-lg shadow-sm transition-all mr-1 mt-0.5"
            title="Back to Range"
          >
            <ArrowLeft size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
          </button>
        )}
        <span className="text-xl font-bold font-sans tabular-nums text-slate-800 dark:text-slate-100 break-words whitespace-normal leading-tight" style={{ color: 'var(--glass-text-primary)' }}>
          {headerText}
        </span>
      </div>

      {/* Subtitle / Period Badges Container */}
      {/* Negative top margin to match Overview Track overlap (-mt-3) */}
      <div
        ref={scrollContainerRef}
        className="h-6 w-full -mt-3 overflow-hidden relative"
      >
        <div
          ref={scrollContentRef}
          className={`flex items-center gap-2 absolute left-0 top-0 h-full whitespace-nowrap ${overflowAmount > 0 ? 'animate-ping-pong' : ''}`}
          style={overflowAmount > 0 ? { '--scroll-target': `-${overflowAmount}px` } as React.CSSProperties : {}}
        >
          {showRangeSubtitle && (
            <>
              <span className="text-xs font-medium tracking-wide text-blue-500 font-sans">
                {rangeSubtitle}
              </span>
              {activePeriods.length > 0 && <span className="text-slate-300">|</span>}
            </>
          )}

          {/* Active Periods Display */}
          {activePeriods.length > 0 && activePeriods.map((period, i) => (
            <span key={i} className="text-[10px] font-bold font-sans text-slate-500 uppercase tracking-wide bg-slate-100/80 px-1.5 py-0.5 rounded-md border border-slate-200 shadow-sm">
              {period.period_name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
