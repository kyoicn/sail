import React, { useRef, useState, useEffect } from 'react';
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
  events: EventData[];
  setJumpTargetId: (id: string | null) => void;
}

/**
 * TimeControl Component
 * ------------------------------------------------------------------
 * The main UI panel at the bottom of the screen.
 * Contains:
 * 1. The Detail Slider (zoomed-in view).
 * 2. Event Markers (clickable ticks).
 * 3. The Overview Timeline (mini-map).
 * 4. Zoom Controls.
 */
export const TimeControl: React.FC<TimeControlProps> = ({ 
  currentDate, 
  setCurrentDate, 
  viewRange, 
  setViewRange,
  globalMin,
  globalMax,
  events,
  setJumpTargetId
}) => {
  
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);

  // --- Animation Logic (Smooth Jump) ---
  const smoothJump = (targetDate: number, eventId: string | null) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    
    // Signal the Map that we are jumping (to prevent layout flicker)
    setJumpTargetId(eventId || "___ANIMATING___");
    
    const startValue = currentDate;
    const distance = targetDate - startValue;
    const duration = 800; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
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
    // Cancel any ongoing auto-scroll
    if (animationRef.current) { 
        cancelAnimationFrame(animationRef.current); 
        animationRef.current = null; 
        setJumpTargetId(null); 
    }
  };

  // Dragging logic
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
    
    // Limits
    if (factor > 1 && newSpan < 10) return; // Max zoom in (10 years)
    if (factor < 1 && newSpan > (globalMax - globalMin)) { 
        setViewRange({ min: globalMin, max: globalMax }); 
        return; 
    }

    const newMin = Math.max(globalMin, currentDate - newSpan / 2);
    const newMax = Math.min(globalMax, newMin + newSpan);
    
    // Re-center if hitting bounds
    if (newMin === globalMin) setViewRange({ min: globalMin, max: globalMin + newSpan });
    else if (newMax === globalMax) setViewRange({ min: globalMax - newSpan, max: globalMax });
    else setViewRange({ min: newMin, max: newMax });
  };

  const resetZoom = () => setViewRange({ min: globalMin, max: globalMax });

  // --- Rendering Helpers ---

  const generateTicks = () => {
    const span = viewRange.max - viewRange.min;
    // Adaptive tick steps based on zoom level
    let step = 1;
    if (span > 1000) step = 1000; 
    else if (span > 500) step = 500; 
    else if (span > 100) step = 100; 
    else if (span > 50) step = 50; 
    else if (span > 10) step = 10;

    const ticks = [];
    const startTick = Math.ceil(viewRange.min / step) * step;
    for (let t = startTick; t <= viewRange.max; t += step) {
        ticks.push({ value: t, left: ((t - viewRange.min) / span) * 100 });
    }
    return ticks;
  };

  const thumbPercent = ((currentDate - viewRange.min) / (viewRange.max - viewRange.min)) * 100;
  const isThumbVisible = currentDate >= viewRange.min && currentDate <= viewRange.max;

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-10">
      <div className="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-6 transition-all hover:shadow-3xl">
        
        {/* Header: Controls & Date Display */}
        <div className="flex justify-between items-end mb-4">
            <div className="flex gap-2">
                <button onClick={resetZoom} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors" title="Reset View">
                    <Maximize size={18} />
                </button>
            </div>
            <div className="flex flex-col items-center">
                <div className="text-4xl font-black text-slate-800 tracking-tight flex items-baseline gap-2 font-mono">
                    {formatNaturalDate(currentDate, viewRange.max - viewRange.min)}
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

        {/* Main Slider Track */}
        <div className="px-4">
            <div className="flex items-center gap-4 relative">
                <div ref={trackRef} className="relative flex-grow h-12 flex items-center group cursor-pointer" onMouseDown={handleTrackMouseDown}>
                    
                    {/* Ticks */}
                    <div className="absolute top-8 w-full h-4">
                        {generateTicks().map((tick) => (
                            <div key={tick.value} className="absolute top-0 w-px h-2 bg-slate-300 flex flex-col items-center" style={{ left: `${tick.left}%` }}>
                                <span className="text-[10px] text-slate-400 mt-2 font-mono whitespace-nowrap">{formatSliderTick(tick.value)}</span>
                            </div>
                        ))}
                    </div>

                    {/* Track Bar */}
                    <div className="absolute w-full h-2 bg-slate-100 rounded-full overflow-hidden z-0">
                        <div className="w-full h-full bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 opacity-50"></div>
                    </div>

                    {/* Event Markers on Track */}
                    <div className="absolute w-full h-full pointer-events-none">
                        {events.map(event => {
                            const sliderVal = toSliderValue(event.start.year);
                            if (sliderVal < viewRange.min || sliderVal > viewRange.max) return null;
                            
                            const percent = ((sliderVal - viewRange.min) / (viewRange.max - viewRange.min)) * 100;
                            const isHovered = hoveredEventId === event.id;
                            const isObscuredByThumb = Math.abs(percent - thumbPercent) < 1.5;

                            return (
                                <div 
                                    key={event.id}
                                    className={`group absolute top-1/2 -translate-y-1/2 w-1.5 h-3 cursor-pointer rounded-[1px] z-20 pointer-events-auto transition-none
                                        ${isObscuredByThumb ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                                        ${isHovered ? 'bg-blue-600 scale-125 shadow-sm border border-white z-30' : 'bg-slate-700/80 hover:bg-blue-500'}`}
                                    style={{ left: `${percent}%` }}
                                    onMouseEnter={() => setHoveredEventId(event.id)}
                                    onMouseLeave={() => setHoveredEventId(null)}
                                    onClick={(e) => { e.stopPropagation(); smoothJump(sliderVal, event.id); }}>
                                    
                                    {/* Tooltip */}
                                    {isHovered && !isObscuredByThumb && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-medium rounded shadow-sm whitespace-nowrap pointer-events-none">
                                            {event.title}
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-800"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Draggable Thumb (The "Playhead") */}
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
            
            {/* Embedded Overview Timeline (Mini-map) */}
            <OverviewTimeline 
                viewRange={viewRange} 
                setViewRange={setViewRange} 
                globalMin={globalMin} 
                globalMax={globalMax} 
                events={events} 
            />
        </div>
      </div>
    </div>
  );
};