import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { EventData } from '../../types';
import { toSliderValue, formatSliderTick } from '../../lib/time-engine';

interface OverviewProps {
    viewRange: { min: number, max: number };
    setViewRange: (range: { min: number, max: number }) => void;
    globalMin: number;
    globalMax: number;
    events: EventData[]; 
}

/**
 * OverviewTimeline (Refined Responsiveness & Visuals)
 * ------------------------------------------------------------------
 * 1. Visuals: Transparent indicator (no hover bg), Tighter Gaussian Kernel.
 * 2. Performance: Replaced 50ms throttle with rAF locking for 60fps sync.
 */
export const OverviewTimeline: React.FC<OverviewProps> = ({
    viewRange,
    setViewRange,
    globalMin,
    globalMax,
    events
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    const dragInfo = useRef({
        startX: 0,
        startLeftPercent: 0,
        widthPercent: 0,
        currentLeftPercent: 0
    });
    
    // Performance: rAF Lock instead of timestamp throttle
    const rafId = useRef<number | null>(null);

    const totalSpan = globalMax - globalMin;
    const BIN_COUNT = 300; 
    
    // [ADJUSTMENT] Tighter Kernel for less "spread"
    // Radius reduced 30 -> 12, Sigma reduced 12 -> 5
    const GAUSSIAN_RADIUS = 12; 
    const GAUSSIAN_SIGMA = 5;

    // --- Heatmap Calculation ---
    const gradientBackground = useMemo(() => {
        if (events.length === 0) return 'transparent';
        const rawBins = new Array(BIN_COUNT).fill(0);
        events.forEach(event => {
            const val = toSliderValue(event.start.year);
            const index = Math.floor(((val - globalMin) / totalSpan) * BIN_COUNT);
            if (index >= 0 && index < BIN_COUNT) rawBins[index]++;
        });

        const kernel = [];
        for (let i = -GAUSSIAN_RADIUS; i <= GAUSSIAN_RADIUS; i++) {
            kernel.push(Math.exp(-(i * i) / (2 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA)));
        }

        const smoothedBins = new Array(BIN_COUNT).fill(0);
        let maxIntensity = 0;

        for (let i = 0; i < BIN_COUNT; i++) {
            let sum = 0;
            for (let k = -GAUSSIAN_RADIUS; k <= GAUSSIAN_RADIUS; k++) {
                const neighborIdx = i + k;
                if (neighborIdx >= 0 && neighborIdx < BIN_COUNT) {
                    sum += rawBins[neighborIdx] * kernel[k + GAUSSIAN_RADIUS];
                }
            }
            smoothedBins[i] = sum;
            if (sum > maxIntensity) maxIntensity = sum;
        }

        const safeMax = maxIntensity > 0 ? maxIntensity : 1;
        const R = 30, G = 58, B = 138;

        const stops = smoothedBins.map((val, index) => {
            const position = (index / (BIN_COUNT - 1)) * 100;
            const ratio = val / safeMax;
            let alpha = 0;
            if (ratio > 0.01) alpha = 0.15 + (Math.pow(ratio, 0.6) * 0.8);
            return `rgba(${R}, ${G}, ${B}, ${alpha.toFixed(3)}) ${position.toFixed(1)}%`;
        });

        return `linear-gradient(to right, ${stops.join(', ')})`;
    }, [events, globalMin, totalSpan, BIN_COUNT]);


    // --- Viewport State Sync ---
    const viewStartPercent = ((viewRange.min - globalMin) / totalSpan) * 100;
    const viewWidthPercent = ((viewRange.max - viewRange.min) / totalSpan) * 100;
    const isFullyZoomedOut = viewWidthPercent > 99;

    useEffect(() => {
        if (!isDragging && indicatorRef.current) {
            indicatorRef.current.style.left = `${viewStartPercent}%`;
            indicatorRef.current.style.width = `${viewWidthPercent}%`;
        }
    }, [viewStartPercent, viewWidthPercent, isDragging]);


    // --- Optimized Drag Handlers ---

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!containerRef.current || !indicatorRef.current) return;
        
        setIsDragging(true);
        
        const rect = containerRef.current.getBoundingClientRect();
        const startLeftPixel = indicatorRef.current.offsetLeft;
        const widthPixel = indicatorRef.current.offsetWidth;
        
        dragInfo.current = {
            startX: e.clientX,
            startLeftPercent: (startLeftPixel / rect.width) * 100,
            widthPercent: (widthPixel / rect.width) * 100,
            currentLeftPercent: (startLeftPixel / rect.width) * 100
        };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current || !indicatorRef.current) return;
        e.preventDefault();
        
        // [PERFORMANCE] Use rAF Lock logic
        // If a frame is already requested, skip this event to avoid stacking work
        if (rafId.current) return;

        const clientX = e.clientX;
        
        rafId.current = requestAnimationFrame(() => {
            if (!containerRef.current || !indicatorRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const deltaPixels = clientX - dragInfo.current.startX;
            const deltaPercent = (deltaPixels / rect.width) * 100;
            
            let newLeftPercent = dragInfo.current.startLeftPercent + deltaPercent;
            const maxLeft = 100 - dragInfo.current.widthPercent;
            
            if (newLeftPercent < 0) newLeftPercent = 0;
            if (newLeftPercent > maxLeft) newLeftPercent = maxLeft;
            
            // 1. Visual Update (Direct DOM)
            indicatorRef.current.style.left = `${newLeftPercent}%`;
            
            // 2. Logic Update (Synced with Frame)
            // Removed 50ms throttle. Now updates as fast as the screen paints.
            const newMin = globalMin + (newLeftPercent / 100) * totalSpan;
            const currentSpan = viewRange.max - viewRange.min;
            const newMax = newMin + currentSpan;
            
            setViewRange({ min: newMin, max: newMax });
            
            rafId.current = null;
        });

    }, [globalMin, totalSpan, viewRange.max, viewRange.min, setViewRange]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        // Clean up any pending frame
        if (rafId.current) cancelAnimationFrame(rafId.current);
        rafId.current = null;

        // Final sync
        if (indicatorRef.current) {
             const currentLeft = parseFloat(indicatorRef.current.style.left);
             const newMin = globalMin + (currentLeft / 100) * totalSpan;
             const currentSpan = viewRange.max - viewRange.min;
             setViewRange({ min: newMin, max: newMin + currentSpan });
        }
    }, [globalMin, totalSpan, viewRange.max, viewRange.min, setViewRange]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (rafId.current) cancelAnimationFrame(rafId.current);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div className="w-full h-8 mt-5 relative select-none group">
            {/* Track Background */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-200/50 rounded-full border border-slate-200" />

            {/* Heatmap Gradient */}
            <div 
                ref={containerRef} 
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden"
                style={{ 
                    backgroundImage: gradientBackground,
                    transition: 'background-image 0.5s ease-out'
                }}
            />

            {/* Viewport Window */}
            <div 
                ref={indicatorRef}
                className={`absolute top-1/2 -translate-y-1/2 h-5 bg-transparent border-[1.5px] border-blue-800/60 rounded-md cursor-grab active:cursor-grabbing hover:border-blue-800 transition-colors z-10 box-border flex items-center justify-between px-0.5 shadow-sm
                ${isFullyZoomedOut ? 'hidden' : 'block'}`}
                style={{ 
                    left: `${viewStartPercent}%`, 
                    width: `${viewWidthPercent}%`, 
                    minWidth: '18px',
                    transition: isDragging ? 'none' : 'left 0.1s ease-out, width 0.1s ease-out'
                }}
                onMouseDown={handleMouseDown}
            >
                <ChevronLeft size={12} strokeWidth={2.5} className="text-blue-900 drop-shadow-sm opacity-90" />
                <ChevronRight size={12} strokeWidth={2.5} className="text-blue-900 drop-shadow-sm opacity-90" />
            </div>

            {/* Labels */}
            <div className="absolute -bottom-2 left-0 text-[10px] text-slate-400 font-mono">{formatSliderTick(globalMin)}</div>
            <div className="absolute -bottom-2 right-0 text-[10px] text-slate-400 font-mono">{formatSliderTick(globalMax)}</div>
        </div>
    );
};