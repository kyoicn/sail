
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Maximize2, ZoomIn, ZoomOut, ArrowLeft, ArrowRight } from 'lucide-react';
import { EventData, MapBounds } from '../../types';
import { OverviewTimeline } from './OverviewTimeline';
import { TimelineCanvas } from './TimelineCanvas';
import {
  toSliderValue,
  getAstroYear,
  fromSliderValue,
  getMonthName,
  formatNaturalDate,
  ZOOM_SCALES,
  getClosestScale
} from '../../lib/time-engine';
import { useActivePeriod } from '../../hooks/useActivePeriod';
import { useAppConfig } from '../../hooks/useAppConfig';

interface TimeControlProps {
  currentDate: number;
  setCurrentDate: (val: number) => void;
  viewRange: { min: number, max: number };
  setViewRange: (range: { min: number, max: number }) => void;
  globalMin: number;
  globalMax: number;
  events: EventData[];        // Renderable (LOD filtered)
  densityEvents: EventData[]; // For Heatmap (Spatially filtered only)
  allEvents?: EventData[];     // All (for animation stability)
  setJumpTargetId?: (id: string | null) => void;
  interactionMode: 'exploration' | 'investigation';
  setInteractionMode: (mode: 'exploration' | 'investigation') => void; // [NEW] Shared Hover State
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
  expandedEventIds: Set<string>;
  mapBounds: MapBounds | null;
}

export const TimeControl: React.FC<TimeControlProps> = ({
  currentDate,
  setCurrentDate,
  viewRange,
  setViewRange,
  globalMin,
  globalMax,
  events,
  densityEvents,
  allEvents = [],
  setJumpTargetId,
  interactionMode,
  setInteractionMode,
  hoveredEventId,
  setHoveredEventId,
  onToggleExpand,
  expandedEventIds,
  mapBounds
}) => {
  // [NEW] Active Period Hook
  const { dataset } = useAppConfig();

  // Calculate query range based on mode
  const queryMinYear = interactionMode === 'exploration' ? viewRange.min : currentDate;
  const queryMaxYear = interactionMode === 'exploration' ? viewRange.max : currentDate;

  // [NEW] Calculate focused bounds (center 50% of the viewport) to reduce noise
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

  const animationRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);

  // --- Animation Logic (Smooth Jump) ---
  const smoothJump = (targetDate: number, eventId: string | null) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setJumpTargetId?.("___ANIMATING___");

    // Resetting View (Maximize) should revert to Exploration Mode
    setInteractionMode('exploration');

    const startValue = currentDate;
    const distance = targetDate - startValue;
    const duration = 800;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (distance * ease);

      setCurrentDate(nextValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        setJumpTargetId?.(null);
      }
    };
    animationRef.current = requestAnimationFrame(animate);
  };

  // --- Interaction Handlers ---

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If in Exploration mode, seeking immediately switches to Investigation mode
    if (interactionMode === 'exploration') {
      setInteractionMode('investigation');
    }

    setIsThumbDragging(true);
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) {
      const offsetX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
      const newValue = viewRange.min + percentage * (viewRange.max - viewRange.min);
      setCurrentDate(newValue);
    }
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsThumbDragging(true);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      setJumpTargetId?.(null);
    }
  };

  // [NEW] Throttle Ref for Dragging
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isThumbDragging || !trackRef.current) return;

      const now = performance.now();
      // Throttle to ~30fps (33ms) to prevent excessive Map re-renders
      if (now - lastUpdateRef.current < 32) return;
      lastUpdateRef.current = now;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      const span = viewRange.max - viewRange.min;
      setCurrentDate(viewRange.min + (span * percent));
    };
    const handleMouseUp = () => setIsThumbDragging(false);

    if (isThumbDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isThumbDragging, viewRange, setCurrentDate]);

  // --- Zoom Logic ---

  const handleZoom = (factor: number) => {
    const span = viewRange.max - viewRange.min;
    const newSpan = span / factor;

    // Limit: Allow zoom down to approx 1 millisecond (~3e-11 years)
    if (factor > 1 && newSpan < 0.000000001) return;

    // Max zoom out limit
    if (factor < 1 && newSpan > (globalMax - globalMin)) {
      setViewRange({ min: globalMin, max: globalMax });
      return;
    }

    const newMin = Math.max(globalMin, currentDate - newSpan / 2);
    const newMax = Math.min(globalMax, newMin + newSpan);

    // Clamp to bounds
    if (newMin <= globalMin) setViewRange({ min: globalMin, max: globalMin + newSpan });
    else if (newMax >= globalMax) setViewRange({ min: globalMax - newSpan, max: globalMax });
    else setViewRange({ min: newMin, max: newMax });
  };

  const resetZoom = () => setViewRange({ min: globalMin, max: globalMax });

  const span = viewRange.max - viewRange.min;
  const thumbPercent = ((currentDate - viewRange.min) / span) * 100;
  const isThumbVisible = currentDate >= viewRange.min && currentDate <= viewRange.max;

  // [NEW] Header Formatting Logic
  const getHeaderContent = () => {
    // Shared subtitle container class for height stability
    // h-6 ensures enough space for the button without jumping
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
            <span className="text-3xl font-bold font-mono tracking-tight text-slate-800 leading-9">
              {formatNaturalDate(viewRange.min, viewRange.max - viewRange.min)} - {formatNaturalDate(viewRange.max, viewRange.max - viewRange.min)}
            </span>

            {/* Absolute positioned button to the right of text */}
            <div className="absolute left-full ml-6 top-1/2 -translate-y-1/2">
              <button
                onClick={handleEnterInvestigation}
                className="group flex items-center gap-2 h-9 px-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 text-sm font-medium rounded-lg shadow-sm transition-all whitespace-nowrap"
                title="Examine specific time point"
              >
                Examine a specific time
                <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
              </button>
            </div>
          </div>
          <div className={subtitleClass}>
            {/* [NEW] Active Periods Display for Exploration Mode */}
            {activePeriods.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {activePeriods.map((period, i) => (
                  <span key={i} className="text-xs font-semibold text-slate-500 uppercase tracking-widest bg-slate-100/50 px-2 py-0.5 rounded-full border border-slate-200/50 whitespace-nowrap">
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
              className="group flex items-center gap-2 h-9 px-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 text-sm font-medium rounded-lg shadow-sm transition-all whitespace-nowrap"
              title="Return to Exploration Mode"
            >
              <ArrowLeft size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
              Back to Range
            </button>
          </div>

          <span className="text-3xl font-bold font-mono tracking-tight text-slate-800 leading-9">
            {formatNaturalDate(currentDate, viewRange.max - viewRange.min)}
          </span>
        </div>

        <div className={subtitleClass}>
          <span className="text-xs text-blue-500 font-medium tracking-wide">
            {rangeSubtitle()}
          </span>
          {/* [NEW] Active Periods Display for Investigation Mode */}
          {activePeriods.length > 0 && (
            <>
              <span className="mx-2 text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                {activePeriods.map((period, i) => (
                  <span key={i} className="text-xs font-semibold text-slate-500 uppercase tracking-widest bg-slate-100/50 px-2 py-0.5 rounded-full border border-slate-200/50 whitespace-nowrap">
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

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-[55vw] px-4 z-10">
      <div className="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-6 transition-all hover:shadow-3xl">

        {/* Controls Header */}
        <div className="relative flex justify-end items-start mb-6">

          {/* Centered Title */}
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            {getHeaderContent()}
          </div>

          {/* Right Controls Group (Hover Trigger for Zoom Menu) */}
          <div className="flex gap-2 relative z-10 group">

            {/* Vertical Scale Menu (Drop-up) - Centered above zoom buttons */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 flex flex-col items-center opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-200 ease-out">
              <div className="bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-white/40 p-1 flex flex-col gap-0.5">
                {[
                  { label: 'All / Reset', id: 'ALL', span: globalMax - globalMin },
                  { label: 'Millennium', id: 'MILLENNIUM', span: ZOOM_SCALES.MILLENNIUM },
                  { label: 'Century', id: 'CENTURY', span: ZOOM_SCALES.CENTURY },
                  { label: 'Decade', id: 'DECADE', span: ZOOM_SCALES.DECADE },
                  { label: 'Year', id: 'YEAR', span: ZOOM_SCALES.YEAR },
                  { label: 'Month', id: 'MONTH', span: ZOOM_SCALES.MONTH },
                  { label: 'Day', id: 'DAY', span: ZOOM_SCALES.DAY },
                ].map((scale) => {
                  const currentSpan = viewRange.max - viewRange.min;
                  const activeKey = getClosestScale(currentSpan, globalMax - globalMin);
                  const isActive = activeKey === scale.id;

                  return (
                    <button
                      key={scale.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Special case for 'All' or just standard setViewRange
                        if (scale.id === 'ALL') {
                          resetZoom();
                        } else {
                          const newSpan = scale.span;
                          const newMin = Math.max(globalMin, currentDate - newSpan / 2);
                          const newMax = Math.min(globalMax, newMin + newSpan);
                          // Clamp bounds if needed, but centering on currentDate is priority
                          if (newMin <= globalMin) setViewRange({ min: globalMin, max: globalMin + newSpan });
                          else if (newMax >= globalMax) setViewRange({ min: globalMax - newSpan, max: globalMax });
                          else setViewRange({ min: newMin, max: newMax });
                        }
                      }}
                      className={`
                        px-3 py-1.5 text-xs font-medium text-left rounded-md w-full whitespace-nowrap transition-colors
                        ${isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                      `}
                    >
                      {scale.label}
                    </button>
                  );
                })}
              </div>
              {/* Connector nub */}
              <div className="w-4 h-4 overflow-hidden -mt-2">
                {/* Invisible spacer or visual connector if desired */}
              </div>
            </div>

            <button onClick={() => handleZoom(0.5)} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm" title="Zoom Out">
              <ZoomOut size={20} />
            </button>
            <button onClick={() => handleZoom(2)} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm" title="Zoom In">
              <ZoomIn size={20} />
            </button>
          </div>
        </div>

        {/* Slider Track */}
        <div className="px-4">
          <div
            ref={trackRef}
            className="relative h-16 mb-2 group cursor-pointer select-none"
            onMouseDown={handleTrackMouseDown}
          >
            {/* [MOVED] Canvas Layer (Replaces DOM Ticks and DOM Markers) */}
            <TimelineCanvas
              currentDate={currentDate}
              viewRange={viewRange}
              events={events} // Render only filtered logic events
              allEvents={allEvents}
              onEventClick={onToggleExpand} // [CHANGE] Use toggle instead of smoothJump
              onHoverChange={setHoveredEventId}
              expandedEventIds={expandedEventIds} // [NEW]
            />

            {/* Track Background */}
            <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-slate-100 rounded-full overflow-hidden z-0 pointer-events-none">
              <div className="w-full h-full bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 opacity-50"></div>
            </div>

            {/* Slider Thumb - Hidden in Exploration Mode */}
            <div
              className={`absolute top-1/2 w-6 h-6 bg-blue-600 rounded-full shadow-lg border-2 border-white z-40 transform -translate-y-1/2 -translate-x-1/2 
                        ${isThumbDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'} 
                        transition-transform duration-75 
                        ${interactionMode === 'investigation' && isThumbVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{ left: `${Math.max(0, Math.min(100, thumbPercent))}%` }}
              onMouseDown={handleThumbMouseDown}
            />

            {/* [NEW] DOM Tooltip Layer (Overlay) - Only in Investigation Mode */}
            {hoveredEventId && interactionMode === 'investigation' && (() => {
              const event = events.find(e => e.id === hoveredEventId);
              if (!event) return null;

              const startFraction = getAstroYear(event.start) - event.start.year;
              const sliderVal = toSliderValue(event.start.year) + startFraction;
              const percent = (sliderVal - viewRange.min) / span;

              // If out of view, don't show (should be filtered by interaction logic anyway)
              if (percent < 0 || percent > 1) return null;

              const xPercent = percent * 100;

              return (
                <div
                  className="absolute bottom-1/2 left-0 mb-6 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded shadow-lg whitespace-nowrap z-50 pointer-events-none transform -translate-x-1/2 transition-opacity duration-150"
                  style={{ left: `${xPercent}% ` }}
                >
                  {event.title}
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -ml-1 border-4 border-transparent border-t-slate-800"></div>
                </div>
              );
            })()}

          </div>
        </div>

        {/* Heatmap Overview */}
        <OverviewTimeline
          viewRange={viewRange}
          setViewRange={setViewRange}
          globalMin={globalMin}
          globalMax={globalMax}
          events={densityEvents} // Pass Spatially Filtered events (High density)
        />
      </div>
    </div>
  );
};