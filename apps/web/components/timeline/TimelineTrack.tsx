
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { EventData } from '@sail/shared';
import { toSliderValue, getAstroYear, formatSliderTick, getMonthName } from '../../lib/time-engine';

interface TimelineCanvasProps {
  currentDate: number;
  viewRange: { min: number, max: number };
  events: EventData[]; // Filtered explicitly visible events
  allEvents: EventData[]; // All events for potential density rendering? (actually we just need the visible ones for markers)
  onEventClick: (id: string) => void; // [CHANGE] Only ID needed now
  onHoverChange: (id: string | null) => void;
  expandedEventIds: Set<string>;
  densityEvents: EventData[]; // [NEW] Full dataset for density waveform
}

export const TimelineTrack: React.FC<TimelineCanvasProps> = ({
  currentDate,
  viewRange,
  events,
  onEventClick,
  onHoverChange,
  expandedEventIds,
  densityEvents
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Track mouse position for hit testing
  const mouseRef = useRef<{ x: number, y: number } | null>(null);

  // --- Pre-Calculation: Optimize Density Data ---
  // Convert complex date objects to simple linear floats once
  const processedDensityPoints = useMemo(() => {
    if (!densityEvents || densityEvents.length === 0) return [];

    // Map to simple structure { val: sliderValue, importance: number }
    const points = densityEvents.map(e => {
      const startFraction = getAstroYear(e.start) - e.start.year;
      const val = toSliderValue(e.start.year) + startFraction;
      return { val, importance: e.importance || 1 };
    });

    // Ensure sorted for efficient range query
    points.sort((a, b) => a.val - b.val);
    return points;
  }, [densityEvents]);

  // [OPTIMIZATION] Use Refs for props/state to decouple render loop from React effect re-runs
  const stateRef = useRef({
    viewRange,
    events,
    hoveredEventId,
    expandedEventIds,
    densityEvents,
    processedDensityPoints
  });

  // Sync Refs including pre-calculated points
  useEffect(() => {
    stateRef.current = { viewRange, events, hoveredEventId, expandedEventIds, densityEvents, processedDensityPoints };
  }, [viewRange, events, hoveredEventId, expandedEventIds, densityEvents, processedDensityPoints]);


  // --- Helper: Generate Ticks (Pure Logic) ---
  const generateTicks = (min: number, max: number, width: number) => {
    const span = max - min;
    if (span <= 0) return [];

    // Target roughly 1 tick per 100-150px
    const tickCountTarget = Math.max(2, Math.floor(width / 120));
    const rawStep = span / tickCountTarget;

    const checkStep = (base: number) => {
      const log = Math.log10(base);
      const floorLog = Math.floor(log);
      const power = Math.pow(10, floorLog);
      const normalized = base / power;
      if (normalized < 1.5) return 1 * power;
      if (normalized < 3.5) return 2 * power;
      if (normalized < 7.5) return 5 * power;
      return 10 * power;
    };

    const step = checkStep(rawStep);
    if (!step || step <= 0) return [];

    const ticks = [];
    const startTick = Math.ceil(min / step) * step;
    const epsilon = step / 10000;

    let current = startTick;
    while (current <= max + epsilon) {
      if (current >= min - epsilon) {
        ticks.push({ value: current });
      }
      current += step;
      // Safety
      if (ticks.length > 200) break; // Increased safety cap slightly
    }
    return ticks;
  };

  // --- Helper: Gaussian Smooth ---
  const ksize = 12;
  const sigma = 4;
  const kernel = useMemo(() => {
    const k = [];
    for (let i = -ksize; i <= ksize; i++) {
      k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
    }
    return k;
  }, []);

  // --- Render Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animationFrameId: number;

    const render = () => {
      // 1. Resize Handling
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();

      // Check if resize needed (minimize DOM writes)
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Read latest state from Ref
      const {
        viewRange: currentViewRange,
        events: currentEvents,
        hoveredEventId: currentHoveredId,
        expandedEventIds: currentExpanded,
        processedDensityPoints: currentPoints // [NEW] Use pre-calc points
      } = stateRef.current;

      const width = rect.width;
      const height = rect.height;

      // Reset Transform
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Scale by DPR
      ctx.clearRect(0, 0, width, height);

      const span = currentViewRange.max - currentViewRange.min;
      if (span <= 0) return;

      const RULER_H = 35; // Increased to 35 to avoid collision with overlapping Overview (which uses -mt-3)
      const WAVE_H = height - RULER_H;
      const MARKER_Y = WAVE_H / 2;

      // --- 0. Draw Background & Border ---
      const r = 8;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(width - r, 0);
      ctx.quadraticCurveTo(width, 0, width, r);
      ctx.lineTo(width, WAVE_H - r);
      ctx.quadraticCurveTo(width, WAVE_H, width - r, WAVE_H);
      ctx.lineTo(r, WAVE_H);
      ctx.quadraticCurveTo(0, WAVE_H, 0, WAVE_H - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();

      // Background Fill (More opaque for contrast)
      ctx.fillStyle = 'rgba(241, 245, 249, 0.9)'; // slate-100 @ 90%
      ctx.fill();

      // Border Stroke
      ctx.strokeStyle = '#cbd5e1'; // slate-300
      ctx.lineWidth = 1;
      ctx.stroke();

      // --- 1. Draw Density Waveform (Optimized) ---
      if (currentPoints && currentPoints.length > 0) {
        const BIN_COUNT = Math.ceil(width / 2); // 1 bin per 2px approx
        const bins = new Array(BIN_COUNT).fill(0);

        // A. Binning (Optimized Loop)
        let maxBin = 0;

        // Binary Search Start (Optional but good) or simple bounds check
        // Simple linear scan is heavily optimized by JIT since objects are simple numbers now
        // But for 10k items, let's just iterate. 
        // Optimization: Since sorted, find start index and break after end?
        // Let's do a simple optimization: Skip if val < min

        // Actually, for smoothness we want a bit of buffer
        const viewMin = currentViewRange.min - (span * 0.1);
        const viewMax = currentViewRange.max + (span * 0.1);

        // Finding start index via binary search would be O(log N). 
        // Linear scan is O(N). 
        // Let's stick to linear for code simplicity unless verified slow, 
        // BUT we break early.

        for (let i = 0; i < currentPoints.length; i++) {
          const p = currentPoints[i];
          if (p.val > viewMax) break; // Sorted, so we can stop
          if (p.val < viewMin) continue;

          // Inside view
          const percent = (p.val - currentViewRange.min) / span;
          const idx = Math.floor(percent * (BIN_COUNT - 1));
          // Check bounds (since we added buffer)
          if (idx >= 0 && idx < BIN_COUNT) {
            bins[idx] += p.importance;
            if (bins[idx] > maxBin) maxBin = bins[idx];
          }
        }

        if (maxBin > 0) {
          // B. Convolution (Smooth)
          const smoothed = new Array(BIN_COUNT).fill(0);
          let localMax = 0;
          for (let i = 0; i < BIN_COUNT; i++) {
            let sum = 0;
            for (let k = -ksize; k <= ksize; k++) {
              const idx = i + k;
              if (idx >= 0 && idx < BIN_COUNT) {
                sum += bins[idx] * kernel[k + ksize];
              }
            }
            smoothed[i] = sum;
            if (sum > localMax) localMax = sum;
          }

          // Waveform Drawing logic
          ctx.save();
          const r2 = 8;
          ctx.beginPath();
          ctx.moveTo(r2, 0);
          ctx.lineTo(width - r2, 0);
          ctx.quadraticCurveTo(width, 0, width, r2);
          ctx.lineTo(width, WAVE_H - r2);
          ctx.quadraticCurveTo(width, WAVE_H, width - r2, WAVE_H);
          ctx.lineTo(r2, WAVE_H);
          ctx.quadraticCurveTo(0, WAVE_H, 0, WAVE_H - r2);
          ctx.lineTo(0, r2);
          ctx.quadraticCurveTo(0, 0, r2, 0);
          ctx.closePath();
          ctx.clip();

          const WAVE_BASE = WAVE_H;
          const DRAW_H = WAVE_H * 0.9;

          ctx.beginPath();
          ctx.moveTo(0, WAVE_BASE);

          for (let i = 0; i < BIN_COUNT; i++) {
            const x = (i / (BIN_COUNT - 1)) * width;
            const intensity = localMax > 0 ? (smoothed[i] / localMax) : 0;
            const boosted = Math.pow(intensity, 0.7);
            const yOffset = boosted * DRAW_H;
            ctx.lineTo(x, WAVE_BASE - yOffset);
          }

          ctx.lineTo(width, WAVE_BASE);
          ctx.closePath();

          // Waveform Fill
          const gradient = ctx.createLinearGradient(0, 0, 0, WAVE_H);
          gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)'); // Blue
          gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.restore(); // End Clipping
        }
      }


      // --- A. Draw Ticks ---
      const ticks = generateTicks(currentViewRange.min, currentViewRange.max, width);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      ticks.forEach(tick => {
        const percent = (tick.value - currentViewRange.min) / span;
        const x = percent * width;

        // Tick Line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)'; // slate-800/15
        ctx.lineWidth = 1;
        ctx.moveTo(x, WAVE_H);
        ctx.lineTo(x, WAVE_H + 5);
        ctx.stroke();

        // Label
        const label = formatSliderTick(tick.value, span);
        ctx.fillText(label, x, WAVE_H + 8);
      });


      // --- B. Draw Events ---
      // Marker Params
      const MARKER_W = 4;
      const MARKER_H = 12;
      // MARKER_Y is already defined above as WAVE_H / 2

      let hitEventId: string | null = null;

      // ... (Rest of event drawing logic) ...

      currentEvents.forEach(event => {
        // Calc X
        const startFraction = getAstroYear(event.start) - event.start.year;
        const sliderVal = toSliderValue(event.start.year) + startFraction;

        // Skip if out of bounds (though React parent likely filtered 'events' prop, 
        // but 'events' prop is usually 'renderable events' which are in view or close to it)
        if (sliderVal < currentViewRange.min || sliderVal > currentViewRange.max) return;

        const percent = (sliderVal - currentViewRange.min) / span;
        const x = percent * width;

        // Hit Test
        const isHovered = currentHoveredId === event.id;
        const isExpanded = currentExpanded.has(event.id); // [NEW] Check expansion state

        // Use either hovered OR expanded for highlight state
        const isHighlighted = isHovered || isExpanded;

        // If mouse is active, check specific collision
        if (mouseRef.current) {
          const mx = mouseRef.current.x;
          const my = mouseRef.current.y;

          const hitW = 10;
          const hitH = 20;
          if (Math.abs(mx - x) < hitW / 2 && Math.abs(my - MARKER_Y) < hitH / 2) {
            hitEventId = event.id;
          }
        }

        // Draw Logic
        ctx.fillStyle = isHighlighted ? '#2563eb' : 'rgba(51, 65, 85, 0.7)'; // blue-600 vs slate-700

        if (isHighlighted) {
          const scale = 1.5;
          const hw = (MARKER_W * scale) / 2;
          const hh = (MARKER_H * scale) / 2;

          ctx.fillRect(x - hw, MARKER_Y - hh, MARKER_W * scale, MARKER_H * scale);

          // Border
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - hw, MARKER_Y - hh, MARKER_W * scale, MARKER_H * scale);

        } else {
          const hw = MARKER_W / 2;
          const hh = MARKER_H / 2;
          ctx.fillRect(x - hw, MARKER_Y - hh, MARKER_W, MARKER_H);
        }
      });

      // ...

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []); // Empty dependency array = persistent loop that reads refs


  // --- Event Handlers ---

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    mouseRef.current = { x, y };

    // Hit Test Logic (Duplicated minimally for React State Update)
    const width = rect.width;
    const height = rect.height;
    const span = viewRange.max - viewRange.min;
    const MARKER_Y = height / 2;
    const hitW = 10;
    const hitH = 20;

    // Find top-most hit
    let foundId: string | null = null;

    // Optimize: Iterate backwards?
    for (const event of events) {
      const startFraction = getAstroYear(event.start) - event.start.year;
      const sliderVal = toSliderValue(event.start.year) + startFraction;

      // Quick bounds check logic
      if (sliderVal < viewRange.min || sliderVal > viewRange.max) continue;

      const percent = (sliderVal - viewRange.min) / span;
      const ex = percent * width;

      if (Math.abs(x - ex) < hitW / 2 && Math.abs(y - MARKER_Y) < hitH / 2) {
        foundId = event.id;
        // Keep searching? No, first hit is fine for now, or last drawn? 
        // Last drawn is usually "on top".
      }
    }

    if (foundId !== hoveredEventId) {
      setHoveredEventId(foundId);
      onHoverChange(foundId);
    }
  };

  const handleMouseLeave = () => {
    mouseRef.current = null;
    setHoveredEventId(null);
    onHoverChange(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hoveredEventId) {
      const event = events.find(ev => ev.id === hoveredEventId);
      if (event) {
        e.stopPropagation(); // Prevent track click
        onEventClick(event.id); // [CHANGE] Only pass ID
      }
    }
  };


  const handleMouseDown = (e: React.MouseEvent) => {
    if (hoveredEventId) {
      // Important: Stop propagation to prevent TimeControl track from
      // initiating drag/seek or switching to Investigation Mode.
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-20"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
