import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { EventData } from '@sail/shared';
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
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);

    // UI State
    const [isDragging, setIsDragging] = useState(false);
    const [virtualWidth, setVirtualWidth] = useState(0);

    // --- Refs for Drag Logic (Solving Stale Closure) ---
    const propsRef = useRef({ viewRange, setViewRange, globalMin, globalMax });
    useEffect(() => {
        propsRef.current = { viewRange, setViewRange, globalMin, globalMax };
    });

    const dragInfo = useRef<{
        startX: number;
        startLeftPixel: number;
        virtualWidth: number;
        widthPixel: number;
        mode: 'pan' | 'resize-left' | 'resize-right';
    }>({
        startX: 0,
        startLeftPixel: 0,
        virtualWidth: 0,
        widthPixel: 0,
        mode: 'pan' // Default
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
        const render = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // 1. Resize Check (Every Frame)
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
            }

            // Get Scroll Position
            const scrollLeft = scrollContainerRef.current ? scrollContainerRef.current.scrollLeft : 0;
            const containerWidth = scrollContainerRef.current ? scrollContainerRef.current.clientWidth : 0;
            // Guard against 0 width
            const vWidth = Math.max(virtualWidth || containerWidth || 1, 1);

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

            ctx.beginPath();
            ctx.strokeStyle = '#93c5fd'; // blue-300 (lighter than blue-500)
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            const width = rect.width;
            const height = rect.height;
            const padding = 4;

            // Draw (View-Mapped)
            // Instead of drawing the whole 300 visible points scaled to virtual width (which might be huge),
            // We map the virtual range back to the canvas [0..width]

            // Optimization: Iterate all bins (300 is low cost) to avoid cutoff artifacts
            // Canvas clipping handles off-screen drawing efficiently.
            const startIdx = 0;
            const endIdx = BIN_COUNT - 1;

            let hasStarted = false;

            for (let i = startIdx; i <= endIdx; i++) {
                const intensity = currentBinsRef.current[i]; // Normalized 0-1
                const globalFraction = i / (BIN_COUNT - 1);

                // Map to Screen Coordinates
                // Virtual X
                const vx = globalFraction * vWidth;
                // Screen X
                const x = vx - scrollLeft;

                // Scale intensity to height, keep it rooted at bottom
                const plotHeight = height - (padding * 2);
                const y = height - padding - (intensity * plotHeight);

                if (!hasStarted) {
                    ctx.moveTo(x, y);
                    hasStarted = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();

            if (needsUpdate || animationFrameId.current === null) {
                animationFrameId.current = requestAnimationFrame(render);
            } else {
                animationFrameId.current = null;
            }
        };

        if (!animationFrameId.current) {
            animationFrameId.current = requestAnimationFrame(render);
        }

        // Attach Scroll Listener to update Canvas
        const sc = scrollContainerRef.current;
        const onScroll = () => {
            if (!animationFrameId.current) {
                animationFrameId.current = requestAnimationFrame(render);
            }
        };

        if (sc) sc.addEventListener('scroll', onScroll);

        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            if (sc) sc.removeEventListener('scroll', onScroll);
        };
    }, [events, virtualWidth]); // Add virtualWidth dependency


    // --- 3. Viewport State Sync & Virtual Width ---
    useEffect(() => {
        if (!scrollContainerRef.current) return;

        const containerW = scrollContainerRef.current.clientWidth;
        const currentSpan = viewRange.max - viewRange.min;
        const totalSpan = globalMax - globalMin;
        const ratio = currentSpan / totalSpan;

        // Calculate Ideal Indicator Width (Standard fit)
        const standardIndicatorW = containerW * ratio;
        const MIN_INDICATOR_W = 80;
        const MAX_VIRTUAL_WIDTH = 5000000; // 5M pixels (Browser Safe Limit)

        let newVirtualWidth = containerW;

        // Tier 2: If indicator would be too small, scale up virtual width
        if (standardIndicatorW < MIN_INDICATOR_W) {
            const scale = MIN_INDICATOR_W / standardIndicatorW;
            newVirtualWidth = Math.min(containerW * scale, MAX_VIRTUAL_WIDTH);
        }

        // [FIX] Race Condition: Force width update immediately so scrolLeft calculation works
        if (contentRef.current) {
            contentRef.current.style.width = `${newVirtualWidth}px`;
        }
        // Keep state sync for React render cycle
        setVirtualWidth(newVirtualWidth);

        // Update Position
        const viewStartPercent = ((viewRange.min - globalMin) / totalSpan); // 0-1 fraction
        // Virtual Position
        let virtualIndicatorW = Math.max(standardIndicatorW * (newVirtualWidth / containerW), MIN_INDICATOR_W);
        // Correct logic: If we clamped width, standard*scale might be < MIN? 
        // standard * (MAX/container) might be tiny.
        // So we strictly force MIN_INDICATOR_W if width was clamped to keep visibility.
        if (standardIndicatorW * (newVirtualWidth / containerW) < MIN_INDICATOR_W) {
            virtualIndicatorW = MIN_INDICATOR_W;
        }

        let virtualLeft = viewStartPercent * newVirtualWidth;

        // Safety Clamp: Ensure it never overflows
        if (virtualLeft + virtualIndicatorW > newVirtualWidth) {
            virtualLeft = newVirtualWidth - virtualIndicatorW;
        }
        if (virtualLeft < 0) virtualLeft = 0;

        if (!isDragging && indicatorRef.current) {
            indicatorRef.current.style.left = `${virtualLeft}px`;
            indicatorRef.current.style.width = `${virtualIndicatorW}px`;
            indicatorRef.current.style.display = ratio > 0.99 ? 'none' : 'flex';
        }

        // Auto-Scroll Logic: Keep indicator in view if we are actively modifying viewRange (not dragging logic)
        // [FIX] Improved centering logic. If scale changes, we almost always want to re-center or maintain relative focus.
        if (!isDragging && scrollContainerRef.current) {
            const sc = scrollContainerRef.current;
            const viewportW = sc.clientWidth;
            const centerVirtual = virtualLeft + (virtualIndicatorW / 2);

            // Scroll Logic Refined:
            // 1. If in "Virtual Mode" (Tier 2 - Huge Width), ALWAYS center the indicator ("Follow Camera" mode).
            //    This prevents the "snap/jump" behavior the user reported.
            // 2. If in "Standard Mode" (Tier 1 - Fit to Screen), only scroll if somehow off-screen (rare/failsafe).

            const isOffScreen = virtualLeft < sc.scrollLeft || (virtualLeft + virtualIndicatorW) > (sc.scrollLeft + viewportW);
            const isVirtual = newVirtualWidth > containerW + 1;

            if (isVirtual) {
                // Continuous Centering (Stable)
                sc.scrollLeft = centerVirtual - (viewportW / 2);
            } else if (isOffScreen) {
                // Failsafe for standard mode
                sc.scrollLeft = centerVirtual - (viewportW / 2);
            }
        }

    }, [viewRange, globalMin, globalMax, isDragging]);


    // --- 4. Drag Logic ---

    const handleWindowMouseMove = useCallback((e: MouseEvent) => {
        e.preventDefault();

        if (rafLock.current) return;

        const clientX = e.clientX;

        rafLock.current = requestAnimationFrame(() => {
            const { startX, startLeftPixel, virtualWidth: vWidth, widthPixel, mode } = dragInfo.current;
            const { globalMin, globalMax, setViewRange } = propsRef.current;
            const deltaPixels = clientX - startX;
            const MIN_W = 80;

            let newLeftPixel = startLeftPixel;
            let newWidthPixel = widthPixel;

            if (mode === 'pan') {
                newLeftPixel = startLeftPixel + deltaPixels;
                const maxLeft = vWidth - widthPixel;
                if (newLeftPixel < 0) newLeftPixel = 0;
                if (newLeftPixel > maxLeft) newLeftPixel = maxLeft;
            } else if (mode === 'resize-left') {
                // Moving left edge: changes left and width
                // Right edge stays fixed at (startLeft + startWidth)
                const rightPixel = startLeftPixel + widthPixel;
                newLeftPixel = startLeftPixel + deltaPixels;

                // Constraints
                if (newLeftPixel < 0) newLeftPixel = 0;
                // Don't let width go below min
                if (rightPixel - newLeftPixel < MIN_W) {
                    newLeftPixel = rightPixel - MIN_W;
                }
                newWidthPixel = rightPixel - newLeftPixel;

            } else if (mode === 'resize-right') {
                // Moving right edge: changes width only
                newWidthPixel = widthPixel + deltaPixels;

                // Constraints
                if (newWidthPixel < MIN_W) newWidthPixel = MIN_W;
                if (newLeftPixel + newWidthPixel > vWidth) {
                    newWidthPixel = vWidth - newLeftPixel;
                }
            }

            // 1. Visual Update
            if (indicatorRef.current) {
                indicatorRef.current.style.left = `${newLeftPixel}px`;
                indicatorRef.current.style.width = `${newWidthPixel}px`;
            }

            // 2. Logic Update
            const totalSpan = globalMax - globalMin;
            const newLeftFraction = newLeftPixel / vWidth;
            const widthFraction = newWidthPixel / vWidth;

            const newMin = globalMin + (newLeftFraction * totalSpan);
            const currentSpan = widthFraction * totalSpan;
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

    const startDrag = (e: React.MouseEvent, mode: 'pan' | 'resize-left' | 'resize-right') => {
        e.preventDefault();
        e.stopPropagation();

        if (!scrollContainerRef.current || !indicatorRef.current) return;

        setIsDragging(true);

        dragInfo.current = {
            startX: e.clientX,
            startLeftPixel: indicatorRef.current.offsetLeft,
            virtualWidth: virtualWidth || scrollContainerRef.current?.offsetWidth || 0,
            widthPixel: indicatorRef.current.offsetWidth,
            mode
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
    };

    return (
        <div className="relative w-full mt-6 h-[76px]">
            {/* Visual Frame: Border & Background (Fixed to Content Height) */}
            <div className="absolute top-0 left-0 w-full h-14 bg-slate-50 rounded-lg border border-slate-200 pointer-events-none z-0" />

            {/* Canvas Chart (Viewport Sized, Underlay) */}
            <div className="absolute top-0 left-0 w-full h-14 overflow-hidden pointer-events-none z-0 rounded-lg">
                <canvas
                    ref={canvasRef}
                    className="w-full h-full mix-blend-multiply opacity-90"
                />
            </div>

            {/* Scroll Container */}
            <div
                ref={scrollContainerRef}
                className="relative w-full h-full select-none group overflow-x-auto overflow-y-hidden custom-scrollbar z-10"
                style={{ paddingBottom: '0px' }}
            >
                {/* Virtual Track / Content Wrapper (Fixed Height) */}
                <div
                    ref={contentRef}
                    className="relative h-14 min-w-full"
                    style={{ width: virtualWidth ? `${virtualWidth}px` : '100%' }}
                >
                    {/* Viewport Window / Indicator */}
                    <div
                        ref={indicatorRef}
                        onMouseDown={(e) => startDrag(e, 'pan')}
                        className="absolute top-0 h-full bg-blue-500/5 border-y-2 border-blue-500 rounded-md cursor-grab active:cursor-grabbing hover:bg-blue-500/10 transition-colors z-10 box-border flex items-center justify-between shadow-sm"
                        style={{
                            minWidth: '80px',
                            // display controlled via effect
                        }}
                    >
                        {/* Left Resize Handle */}
                        <div
                            className="h-full w-4 flex items-center justify-center cursor-w-resize hover:bg-blue-500/20 active:bg-blue-500/40 rounded-l-md border-l-2 border-blue-500 transition-colors"
                            onMouseDown={(e) => startDrag(e, 'resize-left')}
                        >
                            <ChevronLeft size={14} strokeWidth={2.5} className="text-blue-600" />
                        </div>

                        {/* Right Resize Handle */}
                        <div
                            className="h-full w-4 flex items-center justify-center cursor-e-resize hover:bg-blue-500/20 active:bg-blue-500/40 rounded-r-md border-r-2 border-blue-500 transition-colors"
                            onMouseDown={(e) => startDrag(e, 'resize-right')}
                        >
                            <ChevronRight size={14} strokeWidth={2.5} className="text-blue-600" />
                        </div>
                    </div>

                    {/* Labels */}
                    <div className="sticky left-0 bottom-0 pointer-events-none w-full h-full">
                        <div className="absolute -bottom-5 left-0 text-[10px] text-slate-400 font-mono bg-slate-50/80 pr-1">{formatSliderTick(globalMin)}</div>
                        <div className="absolute -bottom-5 right-0 text-[10px] text-slate-400 font-mono bg-slate-50/80 pl-1">{formatSliderTick(globalMax)}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};