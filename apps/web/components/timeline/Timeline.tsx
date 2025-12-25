import { useRef, useState, useEffect, useMemo } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { TimelineOverview } from './TimelineOverview';
import { TimelineTrack } from './TimelineTrack';
import { TimelineHeader } from './parts/TimelineHeader';
import { TimelineTooltip } from './parts/TimelineTooltip';
import { TimelinePlaybackControls } from './parts/TimelinePlaybackControls';
import { TimelineZoomControls } from './parts/TimelineZoomControls';

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
  interactionMode: 'exploration' | 'investigation' | 'playback';
  setInteractionMode: (mode: 'exploration' | 'investigation' | 'playback') => void; // [NEW] Shared Hover State
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  onToggleExpand: (id: string) => void;
  expandedEventIds: Set<string>;
  mapBounds: MapBounds | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onManualStep: () => void; // [NEW]
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  focusedEvent: EventData | null;
  canGoUp: boolean;
  onFocusGoUp: () => void;
  onFocusExit: () => void;
}

export const Timeline: React.FC<TimeControlProps> = ({
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
  mapBounds,
  isPlaying,
  setIsPlaying,
  onManualStep,
  playbackSpeed,
  setPlaybackSpeed,
  focusedEvent,
  canGoUp,
  onFocusGoUp,
  onFocusExit
}) => {
  // --- Refs & State ---
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const animationRef = useRef<number | null>(null);

  // [NEW] Track Dragging State
  const dragStartRef = useRef<{ x: number, viewRange: { min: number, max: number } } | null>(null);
  const hasPannedRef = useRef(false);
  const [isTrackDragging, setIsTrackDragging] = useState(false);

  // --- Interaction Handlers ---

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Initialize Drag State (Don't seek yet)
    if (trackRef.current) {
      setIsTrackDragging(true);
      hasPannedRef.current = false;
      dragStartRef.current = {
        x: e.clientX,
        viewRange: { ...viewRange }
      };
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
      if ((!isThumbDragging && !isTrackDragging) || !trackRef.current) return;

      const now = performance.now();
      // Throttle to ~30fps (33ms) to prevent excessive Map re-renders
      if (now - lastUpdateRef.current < 32) return;
      lastUpdateRef.current = now;

      const rect = trackRef.current.getBoundingClientRect();
      const width = rect.width;
      const span = viewRange.max - viewRange.min;

      // Case 1: Thumb Dragging (Seeking within view)
      if (isThumbDragging) {
        const percent = Math.min(Math.max((e.clientX - rect.left) / width, 0), 1);
        setCurrentDate(viewRange.min + (span * percent));
      }

      // Case 2: Track Dragging (Panning the View)
      if (isTrackDragging && dragStartRef.current) {
        const deltaX = dragStartRef.current.x - e.clientX; // Drag Left -> Move View Right (Time increases)

        // Only start panning after a small threshold to allow for sloppy clicks
        if (Math.abs(deltaX) > 5) {
          hasPannedRef.current = true;
        }

        if (hasPannedRef.current) {
          // Calculate time delta based on pixel delta
          // 1000px = span years
          // deltaX px = ? years
          const timeDelta = (deltaX / width) * (dragStartRef.current.viewRange.max - dragStartRef.current.viewRange.min);

          const newMin = dragStartRef.current.viewRange.min + timeDelta;
          const newMax = dragStartRef.current.viewRange.max + timeDelta;

          // Optional: Clamp global bounds?
          // For now, allow free panning
          setViewRange({ min: newMin, max: newMax });
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // End Thumb Drag
      if (isThumbDragging) {
        setIsThumbDragging(false);
      }

      // End Track Drag
      if (isTrackDragging) {
        setIsTrackDragging(false);

        // If we didn't pan significantly, treat it as a CLICK (Seek)
        if (!hasPannedRef.current && trackRef.current) {
          const rect = trackRef.current.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
          const newValue = viewRange.min + percentage * (viewRange.max - viewRange.min);
          setCurrentDate(newValue);

          // [Fix] Only switch mode on CLICK, not drag
          if (interactionMode === 'exploration') {
            setInteractionMode('investigation');
          }
        }

        dragStartRef.current = null;
        hasPannedRef.current = false;
      }
    };

    if (isThumbDragging || isTrackDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isThumbDragging, isTrackDragging, viewRange, setCurrentDate, setViewRange, interactionMode, setInteractionMode]);

  // [REMOVED] Zoom Logic extracted to TimelineZoomControls

  // [NEW] Scroll to Zoom
  const handleTrackWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    // e.preventDefault(); // React's synthetic event might not support this for passive listeners, but standard behavior usually scrolls page.
    // We want to stop page scroll if possible, but 'wheel' is often passive.
    // In this specific UI (absolute positioned bottom bar), page scroll might not be the primary concern,
    // but let's try to capture it.

    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const width = rect.width;
    const offsetX = e.clientX - rect.left;

    // 1. Calculate Mouse Time (Anchor)
    const percent = Math.max(0, Math.min(1, offsetX / width));
    const currentSpan = viewRange.max - viewRange.min;
    const mouseTime = viewRange.min + (currentSpan * percent);

    // 2. Determine Zoom Factor
    // DeltaY > 0 means scroll down (Zoom Out)
    // DeltaY < 0 means scroll up (Zoom In)
    const ZOOM_SPEED = 0.001;
    const zoomFactor = 1 + (e.deltaY * ZOOM_SPEED);

    // 3. New Span (Clamped)
    // Limits: Min ~1 second, Max 20,000 years
    const MIN_SPAN = 0.00000003; // Approx 1 second
    const MAX_SPAN = 20000;

    let newSpan = currentSpan * zoomFactor;
    newSpan = Math.max(MIN_SPAN, Math.min(MAX_SPAN, newSpan));

    // 4. Calculate New Range to keep mouseTime stationary
    // mouseTime = newMin + (percent * newSpan)
    // => newMin = mouseTime - (percent * newSpan)
    const newMin = mouseTime - (percent * newSpan);
    const newMax = newMin + newSpan;

    setViewRange({ min: newMin, max: newMax });
  };

  const span = viewRange.max - viewRange.min;
  const thumbPercent = ((currentDate - viewRange.min) / span) * 100;
  const isThumbVisible = currentDate >= viewRange.min && currentDate <= viewRange.max;

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-6xl px-4 z-10 flex flex-col items-center gap-2">

      {/* [NEW] Focus Mode Header Bar */}
      {focusedEvent && (
        <div className="bg-white/90 backdrop-blur-md rounded-2xl px-4 py-2 flex items-center gap-3 shadow-lg border border-white/50 animate-in fade-in slide-in-from-bottom-2 max-w-lg">
          <span className="text-xs font-bold uppercase tracking-wide text-blue-800/60 shrink-0">Focusing:</span>
          <span className="text-sm font-bold text-slate-800 flex-1 leading-snug py-0.5">{focusedEvent.title}</span>

          <div className="flex items-center gap-1 shrink-0">
            {/* Separator always visible if buttons exist */}
            <div className="h-4 w-px bg-slate-200 mx-1" />

            {canGoUp && (
              <button
                onClick={onFocusGoUp}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-blue-600 transition-colors"
                title="Go Up to Parent"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
              </button>
            )}

            <button
              onClick={onFocusExit}
              className="p-1 hover:bg-red-50 rounded-full text-slate-400 hover:text-red-500 transition-colors"
              title="Exit Focus Mode"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-auto glass-panel rounded-2xl p-3 shadow-2xl flex items-stretch gap-4 w-full">
        {/* --- LEFT COLUMN: Controls & Info --- */}
        <div className="flex flex-col gap-0 shrink-0 justify-start items-start w-[200px]">
          {/* Header Info */}
          <TimelineHeader
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            viewRange={viewRange}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            mapBounds={mapBounds}
          />
        </div>

        {/* --- MIDDLE COLUMN: Timeline Tracks (Flexible) --- */}
        <div className="flex-1 flex flex-col justify-start gap-0 min-w-0 relative">

          {/* Main Track Row (Playback + Track) */}
          <div className="flex items-start gap-3 w-full relative z-10">
            {/* Playback Controls (Left of Main Track) */}
            {/* Force Update */}
            <TimelinePlaybackControls
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              interactionMode={interactionMode}
              setInteractionMode={setInteractionMode}
              setCurrentDate={setCurrentDate}
              viewRange={viewRange}
              onManualStep={onManualStep}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              focusedEvent={focusedEvent}
              onExitFocusMode={onFocusExit}
            />

            {/* Main Track Container */}
            <div
              ref={trackRef}
              className="relative h-[88px] flex-1 group cursor-pointer select-none"
              onMouseDown={handleTrackMouseDown}
              onWheel={handleTrackWheel}
            >
              <TimelineTrack
                currentDate={currentDate}
                viewRange={viewRange}
                events={events}
                allEvents={allEvents}
                onEventClick={onToggleExpand}
                onHoverChange={setHoveredEventId}
                expandedEventIds={expandedEventIds}
                densityEvents={densityEvents}
              />

              {/* Playback Progress Bar */}
              {(interactionMode === 'playback' || isPlaying) && (
                <div
                  className="absolute top-0 h-[60%] bg-blue-400/10 z-0 pointer-events-none transition-all duration-75 border-r border-blue-400/30 rounded-l-lg"
                  style={{
                    width: `${Math.max(0, Math.min(100, thumbPercent))}%`,
                    left: 0
                  }}
                />
              )}

              {/* Slider Thumb */}
              <div
                className={`absolute top-0 h-14 w-4 z-40 transform -translate-x-1/2 flex flex-col justify-center items-center
                        ${isThumbDragging ? 'cursor-grabbing' : 'cursor-ew-resize'} 
                        ${(interactionMode === 'investigation' || isPlaying) && isThumbVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                        transition-opacity duration-200`}
                style={{ left: `calc(6px + (100% - 12px) * ${Math.max(0, Math.min(100, thumbPercent)) / 100})` }}
                onMouseDown={handleThumbMouseDown}
              >
                {/* Visual Line - H-[52px] to fill track vertically (56px - 4px borders) */}
                <div className="w-[2px] h-[52px] bg-blue-600 shadow-sm" />
              </div>

              <TimelineTooltip
                hoveredEventId={hoveredEventId}
                interactionMode={interactionMode}
                events={events}
                viewRange={viewRange}
              />
            </div>
          </div>

          {/* Overview Track */}
          <div className="w-full -mt-3 pl-11">
            {/* Note: Added pl-11 to align overview with the main track (skipping the 32px button + gap) visually? 
                 Actually, usually overview spans the whole width. But if logic relates to main track x-position...
                 TimelineOverview maps globalMin/Max to width. 
                 TimelineTrack maps viewRange to width. 
                 If Play button pushes MainTrack right, Overview needs to match?
                 Wait, Overview is usually "global context". 
                 If I push MainTrack right by 40px (button), but Overview stays full width, 
                 they won't align vertically if Overview is meant to represent the same screen space x-axis 
                 (which it isn't, it's a different scale). 
                 However, aesthetically, users usually want the left edges to align if they represent "Time start".
                 But Overview is Global Range. Main Track is View Range. They are different scales.
                 So align-left is purely aesthetic. 
                 If I don't pad Overview, it will start at the left edge of the column, UNDER the play button.
                 That's probably fine or even better.
                 But let's stick to standard flow first.
              */}
            <TimelineOverview
              viewRange={viewRange}
              setViewRange={setViewRange}
              globalMin={globalMin}
              globalMax={globalMax}
            />
          </div>
        </div>

        {/* --- RIGHT COLUMN: Zoom Controls --- */}
        <div className="shrink-0">
          <TimelineZoomControls
            currentDate={currentDate}
            viewRange={viewRange}
            setViewRange={setViewRange}
            globalMin={globalMin}
            globalMax={globalMax}
          />
        </div>

      </div>
    </div >
  );
};