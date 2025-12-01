import React, { useRef, useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { EventData } from '../../types'; // Relative path to root types
import { toSliderValue, formatSliderTick } from '../../lib/time-engine';

interface OverviewProps {
    viewRange: { min: number, max: number };
    setViewRange: (range: { min: number, max: number }) => void;
    globalMin: number;
    globalMax: number;
    events: EventData[];
}

/**
 * OverviewTimeline Component
 * ------------------------------------------------------------------
 * Displays the entire historical span (Global Min to Global Max).
 * Allows the user to drag a viewport indicator ("mini-map") to pan/zoom quickly.
 */
export const OverviewTimeline: React.FC<OverviewProps> = ({
    viewRange,
    setViewRange,
    globalMin,
    globalMax,
    events
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartMin, setDragStartMin] = useState(0);

    const totalSpan = globalMax - globalMin;
    
    // Calculate position and width of the viewport indicator
    const viewStartPercent = ((viewRange.min - globalMin) / totalSpan) * 100;
    const viewWidthPercent = ((viewRange.max - viewRange.min) / totalSpan) * 100;
    
    // Hide handles if fully zoomed out to prevent UI clutter
    const isFullyZoomedOut = viewWidthPercent > 99;

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStartX(e.clientX);
        setDragStartMin(viewRange.min);
    };

    // Global event listeners for dragging (to handle mouse leaving the component)
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            
            const rect = containerRef.current.getBoundingClientRect();
            const deltaX = e.clientX - dragStartX;
            
            // Convert pixel movement to year movement
            const yearsPerPixel = totalSpan / rect.width;
            const deltaYears = deltaX * yearsPerPixel;

            const currentSpan = viewRange.max - viewRange.min;
            let newMin = dragStartMin + deltaYears;
            
            // Clamping logic
            if (newMin < globalMin) newMin = globalMin;
            if (newMin + currentSpan > globalMax) newMin = globalMax - currentSpan;

            setViewRange({ min: newMin, max: newMin + currentSpan });
        };

        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartX, dragStartMin, globalMin, globalMax, viewRange, setViewRange, totalSpan]);

    return (
        <div className="w-full h-8 mt-4 relative select-none">
            {/* Background Track with Event Ticks */}
            <div ref={containerRef} className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-100 rounded-full overflow-hidden">
                {events.map(event => {
                    const sliderVal = toSliderValue(event.start.year);
                    const percent = ((sliderVal - globalMin) / totalSpan) * 100;
                    return <div key={event.id} className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: `${percent}%` }} />
                })}
            </div>

            {/* Draggable Viewport Indicator */}
            {!isFullyZoomedOut && (
                <div 
                    className="absolute top-1/2 -translate-y-1/2 h-5 bg-blue-500/10 border-2 border-blue-500 rounded-md cursor-grab active:cursor-grabbing hover:bg-blue-500/20 transition-colors z-10 box-border flex items-center justify-between px-1"
                    style={{ left: `${viewStartPercent}%`, width: `${viewWidthPercent}%`, minWidth: '20px' }}
                    onMouseDown={handleMouseDown}
                >
                    <ChevronLeft size={10} strokeWidth={3} className="text-blue-500" />
                    <ChevronRight size={10} strokeWidth={3} className="text-blue-500" />
                </div>
            )}

            {/* Labels */}
            <div className="absolute -bottom-2 left-0 text-[10px] text-slate-400 font-mono">{formatSliderTick(globalMin)}</div>
            <div className="absolute -bottom-2 right-0 text-[10px] text-slate-400 font-mono">{formatSliderTick(globalMax)}</div>
        </div>
    );
};