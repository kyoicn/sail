import React, { useRef, useState, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { EventData } from '../../types';
import { OverviewTimeline } from './OverviewTimeline';
import { TimelineCanvas } from './TimelineCanvas';
import {
  toSliderValue,
  getAstroYear,
  formatSliderTick,
  formatNaturalDate
} from '../../lib/time-engine';

interface TimeControlProps {
  currentDate: number;
  setCurrentDate: (val: number) => void;
  viewRange: { min: number, max: number };
  setViewRange: (range: { min: number, max: number }) => void;
  globalMin: number;
  globalMax: number;
  events: EventData[];        // Renderable (LOD filtered)
  densityEvents: EventData[]; // For Heatmap (Spatially filtered only)
  allEvents: EventData[];     // All (for animation stability)
  setJumpTargetId: (id: string | null) => void;
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
  allEvents,
  setJumpTargetId
}) => {

  const animationRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null); // State for DOM Tooltip

  // --- Animation Logic (Smooth Jump) ---
  const smoothJump = (targetDate: number, eventId: string | null) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setJumpTargetId(eventId || "___ANIMATING___");

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
        setJumpTargetId(null);
      }
    };
    animationRef.current = requestAnimationFrame(animate);
  };

  // --- Interaction Handlers ---

  const handleTrackMouseDown = (e: React.MouseEvent) => {
    // If we clicked on the Canvas (which is overlaying), and it wasn't handled by a marker click (stopPropagation),
    // then it bubbles here?
    // TimelineCanvas stops propagation on marker click, so this only runs on empty space click.

    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const span = viewRange.max - viewRange.min;
    smoothJump(viewRange.min + (span * percent), null);
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsThumbDragging(true);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      setJumpTargetId(null);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isThumbDragging || !trackRef.current) return;
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

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-[55vw] px-4 z-10">
      <div className="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-6 transition-all hover:shadow-3xl">

        {/* Controls Header */}
        <div className="flex justify-between items-end mb-4">
          <div className="flex gap-2">
            <button onClick={resetZoom} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors" title="Reset View">
              <Maximize size={18} />
            </button>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-4xl font-black text-slate-800 tracking-tight flex items-baseline gap-2 font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatNaturalDate(currentDate, span)}
            </div>
          </div>
          <div className="flex gap-2">
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
          <div className="flex items-center gap-4 relative">
            <div ref={trackRef} className="relative flex-grow h-12 flex items-center group cursor-pointer" onMouseDown={handleTrackMouseDown}>

              {/* [MOVED] Canvas Layer (Replaces DOM Ticks and DOM Markers) */}
              <TimelineCanvas
                currentDate={currentDate}
                viewRange={viewRange}
                events={events} // Render only filtered logic events
                allEvents={allEvents}
                onEventClick={smoothJump}
                onHoverChange={setHoveredEventId}
              />

              {/* Track Background */}
              <div className="absolute w-full h-2 bg-slate-100 rounded-full overflow-hidden z-0 pointer-events-none">
                <div className="w-full h-full bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 opacity-50"></div>
              </div>

              {/* Draggable Thumb */}
              <div
                className={`absolute top-1/2 w-6 h-6 bg-blue-600 rounded-full shadow-lg border-2 border-white z-40 transform -translate-y-1/2 -translate-x-1/2 
                        ${isThumbDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'} 
                        transition-transform duration-75 
                        ${isThumbVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                style={{ left: `${Math.max(0, Math.min(100, thumbPercent))}%` }}
                onMouseDown={handleThumbMouseDown}
              />

              {/* [NEW] DOM Tooltip Layer (Overlay) */}
              {hoveredEventId && (() => {
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
                    className="absolute bottom-full left-0 mb-3 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded shadow-lg whitespace-nowrap z-50 pointer-events-none transform -translate-x-1/2 transition-opacity duration-150"
                    style={{ left: `${xPercent}%` }}
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
    </div>
  );
};