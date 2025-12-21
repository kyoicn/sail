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
  onManualStep
}) => {
  // --- Refs & State ---
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);
  const animationRef = useRef<number | null>(null);

  // --- Interaction Handlers ---

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If in Exploration mode, seeking immediately switches to Investigation mode
    if (interactionMode === 'exploration') {
      setInteractionMode('investigation');
    }

    setIsThumbDragging(true);
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) {
      const offsetX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, offsetX / rect.width));
      const newValue = viewRange.min + percentage * (viewRange.max - viewRange.min);
      setCurrentDate(newValue);
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
      if (!isThumbDragging || !trackRef.current) return;

      const now = performance.now();
      // Throttle to ~30fps (33ms) to prevent excessive Map re-renders
      if (now - lastUpdateRef.current < 32) return;
      lastUpdateRef.current = now;

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

  // [REMOVED] Zoom Logic extracted to TimelineZoomControls

  const span = viewRange.max - viewRange.min;
  const thumbPercent = ((currentDate - viewRange.min) / span) * 100;
  const isThumbVisible = currentDate >= viewRange.min && currentDate <= viewRange.max;

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-6xl px-4 z-10">
      <div className="glass-panel rounded-2xl p-4 shadow-2xl flex items-stretch gap-6">

        {/* --- LEFT COLUMN: Controls & Info --- */}
        <div className="flex flex-col gap-3 shrink-0 justify-center items-start min-w-[200px]">
          {/* Header Info */}
          <TimelineHeader
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            viewRange={viewRange}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            mapBounds={mapBounds}
          />

          {/* Playback Controls (Moved below header) */}
          <TimelinePlaybackControls
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            interactionMode={interactionMode}
            setInteractionMode={setInteractionMode}
            setCurrentDate={setCurrentDate}
            viewRange={viewRange}
            onManualStep={onManualStep}
          />
        </div>

        {/* --- MIDDLE COLUMN: Timeline Tracks (Flexible) --- */}
        <div className="flex-1 flex flex-col justify-center gap-0 min-w-0 relative">

          {/* Main Track */}
          <div
            ref={trackRef}
            className="relative h-20 group cursor-pointer select-none w-full"
            onMouseDown={handleTrackMouseDown}
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
              className={`absolute top-[40%] w-6 h-6 bg-blue-600 rounded-full shadow-lg border-2 border-white z-40 transform -translate-y-1/2 -translate-x-1/2 
                        ${isThumbDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'} 
                        transition-transform duration-75 
                        ${(interactionMode === 'investigation' || isPlaying) && isThumbVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              style={{ left: `${Math.max(0, Math.min(100, thumbPercent))}%` }}
              onMouseDown={handleThumbMouseDown}
            />

            {/* Tooltip Overlay */}
            <TimelineTooltip
              hoveredEventId={hoveredEventId}
              interactionMode={interactionMode}
              events={events}
              viewRange={viewRange}
            />
          </div>

          {/* Overview Track */}
          <div className="w-full -mt-3">
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
    </div>
  );
};