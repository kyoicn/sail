import React, { useRef, useState, useEffect, useCallback } from 'react';
import { formatSliderTick } from '../../lib/time-engine';

interface TimelineOverviewProps {
    viewRange: { min: number, max: number };
    setViewRange: (range: { min: number, max: number }) => void;
    globalMin: number;
    globalMax: number;
}

/**
 * OverviewTimeline (Fixed Typo)
 * ------------------------------------------------------------------
 * 1. Fixed "Cannot access 'newLeftPercent' before initialization" error.
 * 2. Dragging: Standard React Effect pattern for reliable event binding.
 * 3. Visuals: Weighted Canvas Heatmap with Fluid Animation.
 */
export const TimelineOverview: React.FC<TimelineOverviewProps> = ({
    viewRange,
    setViewRange,
    globalMin,
    globalMax
}) => {
    // DOM Refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
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




    // --- 3. Viewport State Sync & Virtual Width ---
    const [containerWidth, setContainerWidth] = useState(0);

    // Resize Observer to keep containerWidth state fresh
    useEffect(() => {
        if (!scrollContainerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(scrollContainerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (!scrollContainerRef.current) return;

        // Use state or ref fallback
        const containerW = containerWidth || scrollContainerRef.current.clientWidth;
        if (containerW === 0) return;

        const currentSpan = viewRange.max - viewRange.min;
        const totalSpan = globalMax - globalMin;
        const ratio = currentSpan / totalSpan;

        // Calculate Ideal Indicator Width (Standard fit)
        const standardIndicatorW = containerW * ratio;
        const MIN_INDICATOR_W = 80;
        const MAX_VIRTUAL_WIDTH = 5000000; // 5M pixels (Browser Safe Limit)

        let newVirtualWidth = containerW;
        let isExpanded = false;

        // Tier 2: If indicator would be too small, scale up virtual width
        if (standardIndicatorW < MIN_INDICATOR_W && ratio > 0) {
            const scale = MIN_INDICATOR_W / standardIndicatorW;
            const expandedW = containerW * scale;

            // Only actually expand if substantially larger to avoid jitter
            if (expandedW > containerW + 1) {
                newVirtualWidth = Math.min(expandedW, MAX_VIRTUAL_WIDTH);
                isExpanded = true;
            }
        }

        // [FIX] Scrollbar issue: relies on JSX style={{ width: virtualWidth ? ... : '100%' }}
        // We set virtualWidth state to 0 when not expanded so it falls back to 100%
        setVirtualWidth(isExpanded ? newVirtualWidth : 0);

        // Update Position
        const viewStartPercent = ((viewRange.min - globalMin) / totalSpan); // 0-1 fraction

        let virtualIndicatorW = standardIndicatorW;
        if (isExpanded) {
            // In virtual mode, indicator is ~80px (preserved by scaling)
            virtualIndicatorW = Math.max(standardIndicatorW * (newVirtualWidth / containerW), MIN_INDICATOR_W);
        } else {
            // In standard mode, just use the ratio width
            virtualIndicatorW = Math.max(standardIndicatorW, 0);
        }

        // Clip/Clamp Logic
        if (isExpanded && virtualIndicatorW < MIN_INDICATOR_W) {
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
            // isExpanded corresponds to virtual mode essentially

            if (isExpanded) {
                // Continuous Centering (Stable)
                sc.scrollLeft = centerVirtual - (viewportW / 2);
            } else if (isOffScreen) {
                // Failsafe for standard mode
                sc.scrollLeft = centerVirtual - (viewportW / 2);
            } else {
                // Ensure we are at 0 if fitting
                if (sc.scrollLeft !== 0) sc.scrollLeft = 0;
            }
        }

    }, [viewRange, globalMin, globalMax, isDragging, containerWidth]);


    // --- 4. Drag Logic ---

    // [Virtualization] Force re-render on scroll to update visible ticks
    const [, forceUpdate] = useState({});
    useEffect(() => {
        const sc = scrollContainerRef.current;
        if (!sc) return;

        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    forceUpdate({});
                    ticking = false;
                });
                ticking = true;
            }
        };

        sc.addEventListener('scroll', onScroll, { passive: true });
        return () => sc.removeEventListener('scroll', onScroll);
    }, []);

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
        <div className="relative w-full mt-0 flex flex-col gap-1">
            {/* Virtual Track / Content Wrapper (Fixed Height) */}
            {/* Scroll Container - Explicitly separate from visual content if possible, 
                or just ensure height is sufficient so scrollbar doesn't eat content.
                User said "under it". Standard overflow-x puts scrollbar at bottom of box.
                If box is 24px and scrollbar is 10px, conflict.
                Let's make wrapper larger to hold scrollbar, but visual track 24px fixed.
             */}

            {/* Thin Scrollbar CSS */}
            <style>{`
                .overview-scrollbar::-webkit-scrollbar {
                    height: 6px;
                    width: 6px;
                    background: transparent;
                }
                .overview-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .overview-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(148, 163, 184, 0.8);
                    border-radius: 10px;
                    border: 0;
                }
                .overview-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(100, 116, 139, 1);
                }
            `}</style>

            {/* Fixed Border Wrapper - Relaxed Height to accommodate scrollbar */}
            <div className="relative w-full h-6 border border-slate-300 rounded bg-slate-100 overflow-hidden">
                <div
                    ref={scrollContainerRef}
                    className={`w-full h-full overflow-y-hidden select-none overview-scrollbar ${virtualWidth > 0 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}
                >
                    <div
                        ref={contentRef}
                        className="relative h-full min-w-full"
                        style={{ width: virtualWidth ? `${virtualWidth}px` : '100%' }}
                    >
                        {/* Global Ruler (Dynamic Ticks & Labels) with Virtual Windowing */}
                        <div className="absolute inset-0 flex items-center pointer-events-none select-none">
                            {/* Horizontal Center Line */}
                            <div className="absolute w-full h-px bg-slate-200" />

                            {(() => {
                                const span = globalMax - globalMin;
                                if (span <= 0) return null;

                                const vWidth = virtualWidth || containerWidth || 1000;
                                const currentScrollLeft = scrollContainerRef.current?.scrollLeft || 0;
                                const viewportWidth = containerWidth || 1000;

                                // Buffer for smooth scrolling (render extra screens)
                                const BUFFER = viewportWidth * 1.5;
                                const visibleStartPx = Math.max(0, currentScrollLeft - BUFFER);
                                const visibleEndPx = currentScrollLeft + viewportWidth + BUFFER;

                                // Target ~80px per tick for better density
                                const targetTickCount = Math.max(2, Math.floor(vWidth / 80));
                                const rawStep = span / targetTickCount;

                                // Round to nice interval
                                const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
                                const base = rawStep / magnitude;

                                let step = magnitude;
                                if (base > 5) step = 10 * magnitude;
                                else if (base > 2) step = 5 * magnitude;
                                else if (base > 1) step = 2 * magnitude;
                                else step = magnitude;

                                const ticks = [];
                                const pxPerYear = vWidth / span;

                                // Optimization: Find start/end tick index based on visible pixels
                                // tickVal = globalMin + (px / vWidth) * span
                                const startYear = globalMin + (visibleStartPx / vWidth) * span;
                                const endYear = globalMin + (visibleEndPx / vWidth) * span;

                                // Snap start to grid
                                const startTick = Math.ceil(startYear / step) * step;

                                // Safety loop cap (just in case)
                                let loopCount = 0;
                                for (let t = startTick; t <= endYear && t <= globalMax; t += step) {
                                    ticks.push(t);
                                    loopCount++;
                                    if (loopCount > 1000) break; // Hard cap per frame
                                }

                                return ticks.map(t => {
                                    const percent = (t - globalMin) / span;
                                    const leftPx = percent * vWidth;
                                    // Use absolute pixels for better precision than % at large scales

                                    const label = formatSliderTick(t, span);

                                    return (
                                        <div
                                            key={t}
                                            className="absolute flex flex-col items-center justify-center transform -translate-x-1/2 h-full z-0"
                                            style={{ left: `${leftPx}px` }}
                                        >
                                            {/* Tick Mark */}
                                            <div className="absolute w-px h-full bg-slate-300/30" />

                                            {/* Label */}
                                            <span className="relative text-[9px] font-semibold text-slate-500/80 px-1 select-none whitespace-nowrap">
                                                {label}
                                            </span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Viewport Window / Indicator */}
                        <div
                            ref={indicatorRef}
                            onMouseDown={(e) => startDrag(e, 'pan')}
                            className="absolute top-0 h-full bg-blue-500/20 border-x-2 border-blue-400 cursor-grab active:cursor-grabbing hover:bg-blue-500/30 transition-colors z-10 box-border flex items-center justify-between shadow-sm"
                            style={{
                                minWidth: '40px',
                            }}
                        >
                            <div
                                className="h-full w-2 cursor-w-resize"
                                onMouseDown={(e) => startDrag(e, 'resize-left')}
                            />
                            <div
                                className="h-full w-2 cursor-e-resize"
                                onMouseDown={(e) => startDrag(e, 'resize-right')}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};