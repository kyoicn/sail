"use client";

import React, { useState, useMemo, useEffect, Suspense, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { EventData, MapBounds } from '@sail/shared';
import { LeafletMap } from '../components/map/LeafletMap';
import { ChronoMapHeader } from '../components/ChronoMapHeader';
import { Timeline } from '../components/timeline/Timeline';
import { EventDetailPanel } from '../components/panel/EventDetailPanel';
import { DebugHUD } from '../components/debug/DebugHUD';
import { CollectionsSidebar } from '../components/collections/CollectionsSidebar';
import FeedbackModal from '../components/feedback/FeedbackModal';

// Imported Hooks
import { useUrlSync } from '../hooks/useUrlSync';
import { useAppConfig } from '../hooks/useAppConfig';
import { useEventData } from '../hooks/useEventData';
import { useFocusData } from '../hooks/useFocusData';
import { useLOD } from '../hooks/useLOD';
import { useEventFilter } from '../hooks/useEventFilter';
import { useAreaShape } from '../hooks/useAreaShape';
import { useFocus } from '../context/FocusContext';
import { getBoundsForEvents } from '../lib/geo-engine';
import { useEventsByIds } from '../hooks/useEventsByIds';
import { usePlaybackEngine } from '../hooks/usePlaybackEngine';

function ChronoMapContent() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024;

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mapStyle, setMapStyle] = useState<string>('voyager');

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';

      // Auto-switch map style if we are on the default for the *previous* theme
      if (prev === 'light' && mapStyle === 'voyager') {
        setMapStyle('dark_matter');
      } else if (prev === 'dark' && mapStyle === 'dark_matter') {
        setMapStyle('voyager');
      }

      return next;
    });
  };

  // --- 1. Infrastructure & Config ---
  const { dataset } = useAppConfig();

  // --- 2. State & URL Sync ---
  const { getInitialState, updateUrl } = useUrlSync({
    lat: 20.0, lng: 0.0, zoom: 3, year: 2024, start: GLOBAL_MIN, end: GLOBAL_MAX
  });
  const initialState = getInitialState();

  const [currentDate, setCurrentDate] = useState(initialState.year);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [viewRange, setViewRange] = useState({
    min: initialState.start,
    max: initialState.end
  });
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [mapViewport, setMapViewport] = useState({
    lat: initialState.lat, lng: initialState.lng, zoom: initialState.zoom
  });
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [playedEventIds, setPlayedEventIds] = useState<Set<string>>(new Set());
  const [zoomAction, setZoomAction] = useState<{ type: 'in' | 'out', id: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<'exploration' | 'investigation' | 'playback'>(initialState.mode as any || 'exploration');
  // [NEW] Shared Hover State for Maps and Timeline
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const {
    focusStack,
    handleFocus,
    handleGoUp,
    handleExit,
    focusedEvent: contextFocusedEvent,
    canGoUp,
    setFocusedEvent: setContextFocusedEvent
  } = useFocus();

  // [NEW] Restore Focus Stack from URL on mount
  useEffect(() => {
    if (initialState.focus && focusStack.length === 0) {
      handleFocus(initialState.focus);
    }
  }, []); // Only on mount

  // [NEW] Playback State
  const [isPlaying, setIsPlaying] = useState(initialState.playing || false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // [NEW] Visual Layer Toggles
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [heatmapStyle, setHeatmapStyle] = useState('classic');
  const [showDots, setShowDots] = useState(true);
  const [dotStyle, setDotStyle] = useState('classic');

  // [NEW] Feedback State
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleZoomClick = (type: 'in' | 'out') => {
    setZoomAction({ type, id: Date.now() });
  };


  // [NEW] Interaction Interrupts Playback
  useEffect(() => {
    // If user actively changes map viewport (Zoom/Pan) or Timeline View Range (Zoom), pause.
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [mapViewport, viewRange]);

  const handleToggleExpand = (id: string) => {
    setExpandedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const activeFocusedEventId = focusStack.length > 0 ? focusStack[focusStack.length - 1] : null;
    updateUrl({
      lat: mapViewport.lat,
      lng: mapViewport.lng,
      zoom: mapViewport.zoom,
      year: currentDate,
      start: viewRange.min,
      end: viewRange.max,
      focus: activeFocusedEventId,
      mode: interactionMode,
      playing: isPlaying
    });
  }, [currentDate, viewRange, mapViewport, focusStack, interactionMode, isPlaying, updateUrl]);


  // --- 3. Logic Pipelines ---

  // Unified Focus-Aware Data Fetching
  const activeFocusedEventId = focusStack.length > 0 ? focusStack[focusStack.length - 1] : null;

  const { allLoadedEvents, allVisibleEvents, loadedEventsBySource, focusedEvent, isLoading } = useFocusData(
    mapBounds,
    mapViewport.zoom,
    viewRange,
    dataset,
    selectedCollection,
    activeFocusedEventId
  );

  // Sync focused object back to context (needed for UI labels, etc.)
  useEffect(() => {
    setContextFocusedEvent(focusedEvent);
  }, [focusedEvent, setContextFocusedEvent]);

  // Compatibility for DebugHUD
  const debugLoadedEvents = allLoadedEvents;

  // LOD Calculation Pipeline
  const lodThreshold = useLOD(viewRange, mapViewport.zoom);

  // Filtering Pipeline
  const { spatiallyFilteredEvents, renderableEvents } = useEventFilter(
    allLoadedEvents, // [FIX] Use the merged list (Base + Forced), not just Base.
    mapBounds,
    lodThreshold,
    selectedEvent?.id,
    focusedEvent,
    interactionMode,
    currentDate,
    viewRange,
    expandedEventIds,
    playedEventIds
  );

  // Playback Engine
  const { handleManualStep } = usePlaybackEngine({
    setCurrentDate,
    viewRange,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    interactionMode,
    spatiallyFilteredEvents,
    setExpandedEventIds,
    setPlayedEventIds
  });

  // [NEW] Focus Mode Handlers
  const handleEnterFocusMode = (event: EventData) => {
    handleFocus(event.id);
  };

  // [NEW] Auto-zoom effect on Focus Change
  useEffect(() => {
    if (!focusedEvent || !focusedEvent.children) return;

    console.log('[FocusMode] Auto-zooming to children of:', focusedEvent.title);

    // Efficiently resolve children using Map
    const childrenOfFocus: EventData[] = [];
    focusedEvent.children.forEach(cid => {
      const child = loadedEventsBySource.get(cid);
      if (child) childrenOfFocus.push(child);
    });

    if (childrenOfFocus.length > 0) {
      const newBounds = getBoundsForEvents(childrenOfFocus);
      if (newBounds) {
        const latSpan = newBounds.north - newBounds.south;
        const lngSpan = newBounds.east - newBounds.west;
        const centerLat = (newBounds.north + newBounds.south) / 2;
        const centerLng = (newBounds.east + newBounds.west) / 2;
        const maxSpan = Math.max(latSpan, lngSpan);
        // [FIX] Respect user's current zoom level. Do not force an arbitrary zoom.
        let zoom = mapViewport.zoom;
        if (maxSpan > 0) {
          zoom = Math.floor(Math.log2(360 / maxSpan)) + 1;
          zoom = Math.min(Math.max(zoom, 2), 16);
        }
        setMapViewport({ lat: centerLat, lng: centerLng, zoom });

        let minYear = Infinity;
        let maxYear = -Infinity;
        childrenOfFocus.forEach(e => {
          if (e.start.astro_year < minYear) minYear = e.start.astro_year;
          const endY = e.end ? e.end.astro_year : e.start.astro_year;
          if (endY > maxYear) maxYear = endY;
        });
        const timeSpan = maxYear - minYear;
        const padding = timeSpan * 0.1 || 10;
        setViewRange({ min: minYear - padding, max: maxYear + padding });
      }
    }
  }, [focusedEvent?.id]); // Runs when the identity of the focused event changes

  // [NEW] Logic to determine which event's shape to render
  // Priority: Selected Event (Side Panel) -> Expanded Event (Card)
  const activeEventForShape = useMemo(() => {
    if (selectedEvent) return selectedEvent;
    if (expandedEventIds.size > 0) {
      // Get the last expanded event (most recent)
      const lastId = Array.from(expandedEventIds).pop();
      return renderableEvents.find(e => e.id === lastId);
    }
    return null;
  }, [selectedEvent, expandedEventIds, renderableEvents]);

  const { shape: activeAreaShape } = useAreaShape(activeEventForShape?.location?.areaId, dataset);

  // [NEW] Sequence Events (Focus Mode)
  // Get direct children of the focused event for drawing connecting lines, even if off-screen.
  const sequenceEvents = useMemo(() => {
    if (!contextFocusedEvent || !contextFocusedEvent.children) return [];

    // We rely on loadedEventsBySource which contains the forced-fetched children from useFocusData.
    // Note: getAstroYear is needed for sorting.
    // We can import it or just use simple comparison if years are standard numbers.
    // But let's assume simple start.year sort for now as top-level layout does.
    // Actually, let's use a safe sort.

    const children = contextFocusedEvent.children
      .map(childId => loadedEventsBySource.get(childId))
      .filter((e): e is EventData => !!e);

    children.sort((a, b) => {
      // Simple sort by astro year or year
      const yA = a.start.astro_year ?? a.start.year;
      const yB = b.start.astro_year ?? b.start.year;
      return yA - yB;
    });

    return children;
  }, [contextFocusedEvent, loadedEventsBySource]);

  // Debug Info
  const isGlobalViewGuess = useMemo(() => {
    if (!mapBounds) return false;
    return mapViewport.zoom < 5.5 || (mapBounds.east - mapBounds.west) >= 300;
  }, [mapBounds, mapViewport.zoom]);


  // --- 4. View Layer ---
  return (
    <div className={`flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100 ${theme === 'dark' ? 'dark' : ''}`}>

      {dataset !== 'prod' && (
        <DebugHUD
          zoom={mapViewport.zoom}
          center={mapViewport}
          bounds={mapBounds}
          lodThreshold={lodThreshold}
          fetchedCount={debugLoadedEvents.length}
          renderedCount={renderableEvents.length}
          isGlobalViewGuess={isGlobalViewGuess}
          activeEvents={renderableEvents}
          expandedEventIds={expandedEventIds}

          showHeatmap={showHeatmap}
          setShowHeatmap={setShowHeatmap}
          heatmapStyle={heatmapStyle}
          setHeatmapStyle={setHeatmapStyle}
          showDots={showDots}
          setShowDots={setShowDots}
          dotStyle={dotStyle}
          setDotStyle={setDotStyle}
        />
      )}

      <CollectionsSidebar
        selectedCollection={selectedCollection}
        onSelect={setSelectedCollection}
        dataset={dataset}
      />

      <ChronoMapHeader
        dataset={dataset}
        isLoading={isLoading}
        theme={theme}
        toggleTheme={toggleTheme}
        mapStyle={mapStyle}
        setMapStyle={setMapStyle}
        onZoom={handleZoomClick}
        onFeedbackClick={() => setIsFeedbackOpen(true)}
      />

      <main className="flex-grow relative z-0">
        <LeafletMap
          currentDate={currentDate}
          events={renderableEvents}
          viewRange={viewRange}
          jumpTargetId={jumpTargetId}
          onBoundsChange={setMapBounds}
          initialCenter={{ lat: initialState.lat, lng: initialState.lng }}
          initialZoom={initialState.zoom}
          onViewportChange={(center, zoom) => setMapViewport({ ...center, zoom })}
          onEventSelect={(event) => setSelectedEvent(event)}
          expandedEventIds={expandedEventIds}
          onToggleExpand={handleToggleExpand}
          zoomAction={zoomAction}
          interactionMode={interactionMode}
          hoveredEventId={hoveredEventId}
          setHoveredEventId={setHoveredEventId}
          activeAreaShape={activeAreaShape}
          theme={theme}
          mapStyle={mapStyle}
          heatmapData={spatiallyFilteredEvents}
          showHeatmap={showHeatmap}
          heatmapStyle={heatmapStyle}
          showDots={showDots}
          dotStyle={dotStyle}
          onEnterFocusMode={handleEnterFocusMode}
          focusStack={focusStack}
          sequenceEvents={sequenceEvents}
        />
      </main>

      {/* Timeline Control Layer */}
      <Timeline
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        viewRange={viewRange}
        setViewRange={setViewRange}
        globalMin={GLOBAL_MIN}
        globalMax={GLOBAL_MAX}
        events={renderableEvents}
        densityEvents={spatiallyFilteredEvents}
        allEvents={allLoadedEvents}
        setJumpTargetId={setJumpTargetId}
        interactionMode={interactionMode}
        setInteractionMode={setInteractionMode}
        hoveredEventId={hoveredEventId}
        setHoveredEventId={setHoveredEventId}
        onToggleExpand={handleToggleExpand}
        expandedEventIds={expandedEventIds}
        mapBounds={mapBounds}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onManualStep={handleManualStep}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        focusedEvent={contextFocusedEvent}
        canGoUp={canGoUp}
        onFocusGoUp={handleGoUp}
        onFocusExit={handleExit}
      />

      <EventDetailPanel
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onEnterFocusMode={handleEnterFocusMode}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

    </div>
  );
}

export default function ChronoMapPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
      </div>
    }>
      <ChronoMapContent />
    </Suspense>
  );
}