import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { formatNaturalDate } from '../../../lib/time-engine';
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

  // Shared subtitle container class for height stability
  const subtitleClass = "h-6 flex items-center justify-start gap-2 mt-1 overflow-hidden";

  // Determine display text based on mode
  const headerText = interactionMode === 'exploration'
    ? `${formatNaturalDate(viewRange.min, viewRange.max - viewRange.min)} - ${formatNaturalDate(viewRange.max, viewRange.max - viewRange.min)}`
    : formatNaturalDate(currentDate, viewRange.max - viewRange.min);

  const showRangeSubtitle = interactionMode === 'investigation';
  const rangeSubtitle = `View: ${formatNaturalDate(viewRange.min, viewRange.max - viewRange.min)} - ${formatNaturalDate(viewRange.max, viewRange.max - viewRange.min)}`;

  return (
    <div className="flex flex-col items-start min-w-[300px]">
      <div className="flex items-center gap-3">
        {interactionMode !== 'exploration' && (
          <button
            onClick={() => setInteractionMode('exploration')}
            className="group flex items-center justify-center p-1.5 bg-white/10 hover:bg-white/20 border border-white/10 hover:border-blue-400/50 text-white/90 hover:text-blue-400 rounded-lg shadow-sm transition-all"
            title="Back to Range"
          >
            <ArrowLeft size={20} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
          </button>
        )}
        <span className="text-3xl font-bold font-mono tracking-tight leading-9" style={{ color: 'var(--glass-text-primary)' }}>
          {headerText}
        </span>
      </div>

      <div className={subtitleClass}>
        {showRangeSubtitle && (
          <>
            <span className="text-xs font-medium tracking-wide text-blue-500 whitespace-nowrap">
              {rangeSubtitle}
            </span>
            {activePeriods.length > 0 && <span className="mx-2 text-slate-300">|</span>}
          </>
        )}

        {/* Active Periods Display */}
        {activePeriods.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {activePeriods.map((period, i) => (
              <span key={i} className="text-xs font-semibold text-white/70 uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full border border-white/20 whitespace-nowrap">
                {period.period_name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
