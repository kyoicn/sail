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
  const subtitleClass = "h-6 flex items-center justify-center gap-2 mt-1 px-4 max-w-lg mx-auto overflow-hidden";

  if (interactionMode === 'exploration') {
    const handleEnterInvestigation = () => {
      setInteractionMode('investigation');
      // Jump to center of the current view range
      setCurrentDate((viewRange.min + viewRange.max) / 2);
    };

    return (
      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center hidden-scrollbar">
          <span className="text-3xl font-bold font-mono tracking-tight leading-9" style={{ color: 'var(--glass-text-primary)' }}>
            {formatNaturalDate(viewRange.min, viewRange.max - viewRange.min)} - {formatNaturalDate(viewRange.max, viewRange.max - viewRange.min)}
          </span>

          {/* Absolute positioned button to the right of text */}
          <div className="absolute left-full ml-6 top-1/2 -translate-y-1/2">
            <button
              onClick={handleEnterInvestigation}
              className="group flex items-center gap-2 h-9 px-4 bg-white/40 hover:bg-white/60 border border-black/5 hover:border-blue-400/50 text-slate-700 hover:text-blue-600 text-sm font-medium rounded-lg shadow-sm transition-all whitespace-nowrap"
              title="Examine specific time point"
            >
              Examine a specific time
              <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            </button>
          </div>
        </div>
        <div className={subtitleClass}>
          {/* Active Periods Display for Exploration Mode */}
          {activePeriods.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap justify-center">
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
  }

  // Investigation Mode
  const rangeSubtitle = () => {
    const span = viewRange.max - viewRange.min;
    return `View: ${formatNaturalDate(viewRange.min, span)} - ${formatNaturalDate(viewRange.max, span)} `;
  };

  return (
    <div className="flex flex-col items-center relative group">
      <div className="relative flex items-center justify-center">
        {/* Absolute positioned button to the left of text */}
        <div className="absolute right-full mr-6 top-1/2 -translate-y-1/2">
          <button
            onClick={() => setInteractionMode('exploration')}
            className="group flex items-center gap-2 h-9 px-4 bg-white/10 hover:bg-white/20 border border-white/10 hover:border-blue-400/50 text-white/90 hover:text-blue-400 text-sm font-medium rounded-lg shadow-sm transition-all whitespace-nowrap"
            title="Return to Exploration Mode"
          >
            <ArrowLeft size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            Back to Range
          </button>
        </div>

        <span className="text-3xl font-bold font-mono tracking-tight leading-9" style={{ color: 'var(--glass-text-primary)' }}>
          {formatNaturalDate(currentDate, viewRange.max - viewRange.min)}
        </span>
      </div>

      <div className={subtitleClass} style={{ color: 'var(--glass-text-secondary)' }}>
        <span className="text-xs font-medium tracking-wide text-blue-500">
          {rangeSubtitle()}
        </span>
        {/* Active Periods Display for Investigation Mode */}
        {activePeriods.length > 0 && (
          <>
            <span className="mx-2 text-slate-300">|</span>
            <div className="flex items-center gap-1.5">
              {activePeriods.map((period, i) => (
                <span key={i} className="text-xs font-semibold text-white/70 uppercase tracking-widest bg-white/10 px-2 py-0.5 rounded-full border border-white/20 whitespace-nowrap">
                  {period.period_name}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
