import React, { useRef, useState, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { EventData } from '../../types';
import { OverviewTimeline } from './OverviewTimeline';
import {
  toSliderValue,
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

  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);

  // Create a Set for O(1) lookup of currently visible events (spatial filter)
  const visibleIds = useMemo(() => new Set(events.map(e => e.id)), [events]);

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

    // [UPDATED] Limit: Allow zoom down to approx 1 millisecond (~3e-11 years)
    // 0.000000001 is a safe lower bound for validation
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

  // --- Rendering Helpers ---

  const generateTicks = () => {
    const span = viewRange.max - viewRange.min;

    // [UPDATED] Dynamic Step Generation
    // Find the order of magnitude of the span (e.g. 1000 -> 3, 0.1 -> -1)
    // We want about 5-10 ticks per view. 
    // Target step ≈ span / 5.
    const rawStep = span / 5;

    // Snap to nice numbers: 1, 2, 5 * 10^n
    const checkStep = (base: number) => {
      const log = Math.log10(base);
      const floorLog = Math.floor(log);
      const power = Math.pow(10, floorLog);
      const normalized = base / power; // 1.0 ... 9.99

      if (normalized < 1.5) return 1 * power;
      if (normalized < 3.5) return 2 * power;
      if (normalized < 7.5) return 5 * power;
      return 10 * power;
    };

    const step = checkStep(rawStep);

    const ticks = [];
    // Important: Use floor/ceil with awareness of small float precision
    const startTick = Math.ceil(viewRange.min / step) * step;
    const endTick = Math.floor(viewRange.max / step) * step;

    // Safety break for infinite loops if step is 0 or NaN
    if (!step || step <= 0) return [];

    let current = startTick;
    // Tiny epsilon to handle float comparisons
    const epsilon = step / 10000;

    while (current <= viewRange.max + epsilon) {
      if (current >= viewRange.min - epsilon) {
        ticks.push({
          value: current,
          left: ((current - viewRange.min) / span) * 100
        });
      }
      current += step;
      // Safety: Limit max ticks to avoid crashing UI
      if (ticks.length > 50) break;
    }

    return ticks;
  };

  const span = viewRange.max - viewRange.min;
  const thumbPercent = ((currentDate - viewRange.min) / span) * 100;
  const isThumbVisible = currentDate >= viewRange.min && currentDate <= viewRange.max;

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-10">
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

              {/* Ticks */}
              <div className="absolute top-8 w-full h-10">
                {generateTicks().map((tick, i) => (
                  <div key={i} className="absolute top-0 w-px h-2 bg-slate-300 flex flex-col items-center transition-all duration-300" style={{ left: `${tick.left}%` }}>
                    <span className="text-[10px] text-slate-400 mt-2 font-mono whitespace-nowrap">
                      {formatSliderTick(tick.value, span)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Track Background */}
              <div className="absolute w-full h-2 bg-slate-100 rounded-full overflow-hidden z-0">
                <div className="w-full h-full bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 opacity-50"></div>
              </div>

              {/* Event Markers: Render ALL events (from MOCK_EVENTS), animate opacity based on visibility */}
              <div className="absolute w-full h-full pointer-events-none">
                {(allEvents || []).map(event => {
                  const sliderVal = toSliderValue(event.start.year);

                  // Optimization: Only render DOM nodes for events within the current time viewRange
                  if (sliderVal < viewRange.min || sliderVal > viewRange.max) return null;

                  const percent = ((sliderVal - viewRange.min) / (viewRange.max - viewRange.min)) * 100;

                  // Check if the event is LOD-visible (exists in the filtered 'events' prop)
                  const isVisible = visibleIds.has(event.id);

                  const isHovered = hoveredEventId === event.id;
                  const isObscuredByThumb = Math.abs(percent - thumbPercent) < 1.5;

                  return (
                    <div
                      key={event.id}
                      className={`group absolute top-1/2 -translate-y-1/2 w-1.5 h-3 cursor-pointer rounded-[1px] z-20 transition-all duration-300 ease-out
                                        ${isVisible ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-0 pointer-events-none'}
                                        ${isObscuredByThumb ? 'opacity-0' : ''}
                                        ${isHovered ? 'bg-blue-600 scale-150 shadow-sm border border-white z-30' : 'bg-slate-700/80 hover:bg-blue-500'}`}
                      style={{ left: `${percent}%` }}
                      onMouseEnter={() => isVisible && setHoveredEventId(event.id)}
                      onMouseLeave={() => setHoveredEventId(null)}
                      onClick={(e) => {
                        if (!isVisible) return;
                        e.stopPropagation();
                        smoothJump(sliderVal, event.id);
                      }}>

                      {isHovered && !isObscuredByThumb && isVisible && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-medium rounded shadow-sm whitespace-nowrap pointer-events-none">
                          {event.title}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-800"></div>
                        </div>
                      )}
                    </div>
                  );
                })}
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