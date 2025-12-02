import React, { useRef, useState, useEffect, useCallback } from 'react';
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
 * OverviewTimeline (Fixed Typo)
 * ------------------------------------------------------------------
 * 1. Fixed "Cannot access 'newLeftPercent' before initialization" error.
 * 2. Dragging: Standard React Effect pattern for reliable event binding.
 * 3. Visuals: Weighted Canvas Heatmap with Fluid Animation.
 */
export const OverviewTimeline: React.FC<OverviewProps> = ({
    viewRange,
    setViewRange,
    globalMin,
    globalMax,
    events
}) => {
    // DOM Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // UI State
    const [isDragging, setIsDragging] = useState(false);
    
    // --- Refs for Drag Logic (Solving Stale Closure) ---
    const propsRef = useRef({ viewRange, setViewRange, globalMin, globalMax });
    useEffect(() => {
        propsRef.current = { viewRange, setViewRange, globalMin, globalMax };
    });

    const dragInfo = useRef({
        startX: 0,
        startLeftPixel: 0,
        containerWidth: 0,
        widthPixel: 0
    });
    const rafLock = useRef<number | null>(null);

    // Heatmap Animation Refs
    const targetBinsRef = useRef<number[]>([]);
    const currentBinsRef = useRef<number[]>([]);
    const animationFrameId = useRef<number | null>(null);

    // Constants
    const totalSpan = globalMax - globalMin;
    const BIN_COUNT = 300; 
    const GAUSSIAN_RADIUS = 12; 
    const GAUSSIAN_SIGMA = 5;

    // --- 1. Heatmap Data Calculation ---
    useEffect(() => {
        const targetBins = new Array(BIN_COUNT).fill(0);

        if (events && events.length > 0) {
            // A. Raw Binning
            const rawBins = new Array(BIN_COUNT).fill(0);
            events.forEach(event => {
                const val = toSliderValue(event.start.year);
                const index = Math.floor(((val - globalMin) / totalSpan) * BIN_COUNT);
                if (index >= 0 && index < BIN_COUNT) {
                    rawBins[index] += (event.importance || 1);
                }
            });

            // B. Gaussian Kernel Prep
            const kernel = [];
            for (let i = -GAUSSIAN_RADIUS; i <= GAUSSIAN_RADIUS; i++) {
                kernel.push(Math.exp(-(i * i) / (2 * GAUSSIAN_SIGMA * GAUSSIAN_SIGMA)));
            }

            // C. Convolution
            let maxVal = 0;
            const smoothedBins = new Array(BIN_COUNT).fill(0);

            for (let i = 0; i < BIN_COUNT; i++) {
                let sum = 0;
                for (let k = -GAUSSIAN_RADIUS; k <= GAUSSIAN_RADIUS; k++) {
                    const neighborIdx = i + k;
                    if (neighborIdx >= 0 && neighborIdx < BIN_COUNT) {
                        sum += rawBins[neighborIdx] * kernel[k + GAUSSIAN_RADIUS];
                    }
                }
                smoothedBins[i] = sum;
                if (sum > maxVal) maxVal = sum;
            }

            // D. Normalization (Log Scale)
            const safeMax = maxVal > 0 ? maxVal : 1;
            // Use Log scale to boost visibility of lower-importance events
            // Formula: intensity = log(value + 1) / log(max + 1)
            const logMax = Math.log(safeMax + 1);

            for (let i = 0; i < BIN_COUNT; i++) {
                if (smoothedBins[i] > 0 && logMax > 0) {
                    targetBins[i] = Math.log(smoothedBins[i] + 1) / logMax;
                } else {
                    targetBins[i] = 0;
                }
            }
        }

        targetBinsRef.current = targetBins;

        if (currentBinsRef.current.length !== BIN_COUNT) {
            currentBinsRef.current = new Array(BIN_COUNT).fill(0);
        }
    }, [events, globalMin, globalMax, totalSpan]); 


    // --- 2. Canvas Rendering Loop ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        }

        const render = () => {
            let needsUpdate = false;
            const lerpFactor = 0.15; 
            const tolerance = 0.001; 

            // Interpolate
            for (let i = 0; i < BIN_COUNT; i++) {
                const current = currentBinsRef.current[i];
                const target = targetBinsRef.current[i];
                const diff = target - current;
                
                if (Math.abs(diff) > tolerance) {
                    currentBinsRef.current[i] = current + diff * lerpFactor;
                    needsUpdate = true;
                } else {
                    currentBinsRef.current[i] = target;
                }
            }

            // Draw
            ctx.clearRect(0, 0, rect.width, rect.height);
            const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
            
            const R = 30, G = 58, B = 138; // Navy Blue

            const step = 2; 
            for (let i = 0; i < BIN_COUNT; i += step) {
                const intensity = currentBinsRef.current[i];
                const pos = i / (BIN_COUNT - 1);
                
                let alpha = 0;
                if (intensity > 0.01) {
                    alpha = 0.15 + (Math.pow(intensity, 0.6) * 0.8);
                }
                gradient.addColorStop(pos, `rgba(${R}, ${G}, ${B}, ${alpha})`);
            }

            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, rect.width, rect.height);

            if (needsUpdate || animationFrameId.current === null) {
                animationFrameId.current = requestAnimationFrame(render);
            } else {
                animationFrameId.current = null;
            }
        };

        if (!animationFrameId.current) {
            animationFrameId.current = requestAnimationFrame(render);
        }

        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        };
    }, [events]); 


    // --- 3. Viewport State Sync ---
    const viewStartPercent = ((viewRange.min - globalMin) / totalSpan) * 100;
    const viewWidthPercent = ((viewRange.max - viewRange.min) / totalSpan) * 100;
    const isFullyZoomedOut = viewWidthPercent > 98; // Relaxed threshold

    useEffect(() => {
        if (!isDragging && indicatorRef.current) {
            indicatorRef.current.style.left = `${viewStartPercent}%`;
            indicatorRef.current.style.width = `${viewWidthPercent}%`;
            indicatorRef.current.style.display = isFullyZoomedOut ? 'none' : 'flex';
        }
    }, [viewStartPercent, viewWidthPercent, isDragging, isFullyZoomedOut]);


    // --- 4. Drag Logic ---

    const handleWindowMouseMove = useCallback((e: MouseEvent) => {
        e.preventDefault();
        
        if (rafLock.current) return;

        const clientX = e.clientX;

        rafLock.current = requestAnimationFrame(() => {
            const { startX, startLeftPixel, containerWidth, widthPixel } = dragInfo.current;
            const { globalMin, globalMax, setViewRange } = propsRef.current; 
            
            const totalSpan = globalMax - globalMin;
            const deltaPixels = clientX - startX;
            
            let newLeftPixel = startLeftPixel + deltaPixels;
            const maxLeft = containerWidth - widthPixel;

            // Clamp
            if (newLeftPixel < 0) newLeftPixel = 0;
            // [FIXED TYPO HERE] was newLeftPercent > maxLeft
            if (newLeftPixel > maxLeft) newLeftPixel = maxLeft;

            // 1. Visual Update
            if (indicatorRef.current) {
                indicatorRef.current.style.left = `${newLeftPixel}px`;
            }

            // 2. Logic Update
            const newLeftPercent = newLeftPixel / containerWidth;
            const widthPercent = widthPixel / containerWidth;
            
            const newMin = globalMin + (newLeftPercent * totalSpan);
            const currentSpan = widthPercent * totalSpan;
            const newMax = newMin + currentSpan;

            setViewRange({ min: newMin, max: newMax });
            
            rafLock.current = null;
        });
    }, []);

    const handleWindowMouseUp = useCallback(() => {
        setIsDragging(false);
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
        if (rafLock.current) cancelAnimationFrame(rafLock.current);
        rafLock.current = null;
    }, [handleWindowMouseMove]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!containerRef.current || !indicatorRef.current) return;
        
        setIsDragging(true);

        const rect = containerRef.current.getBoundingClientRect();
        dragInfo.current = {
            startX: e.clientX,
            startLeftPixel: indicatorRef.current.offsetLeft,
            containerWidth: containerRef.current.offsetWidth,
            widthPixel: indicatorRef.current.offsetWidth
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-8 mt-5 relative select-none group"
        >
            {/* Track Background */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-200/50 rounded-full border border-slate-200" />

            {/* Canvas Heatmap */}
            <canvas 
                ref={canvasRef}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 w-full rounded-full"
            />

            {/* Viewport Window */}
            <div 
                ref={indicatorRef}
                onMouseDown={handleMouseDown}
                className="absolute top-1/2 -translate-y-1/2 h-5 bg-transparent border-[1.5px] border-blue-800/60 rounded-md cursor-grab active:cursor-grabbing hover:border-blue-800 transition-colors z-10 box-border flex items-center justify-between px-0.5 shadow-sm"
                style={{ 
                    display: isFullyZoomedOut ? 'none' : 'flex',
                    minWidth: '18px',
                    transition: isDragging ? 'none' : 'left 0.1s ease-out, width 0.1s ease-out'
                }}
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