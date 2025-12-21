"use client";

import { Analytics } from "@vercel/analytics/next"
import React, { useState, useMemo, useEffect, Suspense, useRef } from 'react';
import { Map as MapIcon, Layers, Loader2, Plus, Minus, Sun, Moon } from 'lucide-react';

import { EventData, MapBounds } from '@sail/shared';
import { LeafletMap } from '../components/map/LeafletMap';
import { TimeControl } from '../components/timeline/TimeControl';
import { EventDetailPanel } from '../components/panel/EventDetailPanel';
import { DebugHUD } from '../components/debug/DebugHUD';
import { CollectionsSidebar } from '../components/collections/CollectionsSidebar';

// Imported Hooks
import { useUrlSync } from '../hooks/useUrlSync';
import { useAppConfig } from '../hooks/useAppConfig';
import { useEventData } from '../hooks/useEventData';
import { useLOD } from '../hooks/useLOD';
import { useEventFilter } from '../hooks/useEventFilter';
import { useAreaShape } from '../hooks/useAreaShape';
import { ZOOM_SCALES } from '../lib/time-engine';

function ChronoMapContent() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024;

  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // --- 1. Infrastructure & Config ---
  const { dataset } = useAppConfig();

  // --- 2. State & URL Sync ---
  const { getInitialState, updateUrl } = useUrlSync({
    lat: 48.8566, lng: 2.3522, zoom: 11, year: 2024, span: GLOBAL_MAX - GLOBAL_MIN
  });
  const initialState = getInitialState();

  const [currentDate, setCurrentDate] = useState(initialState.year);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [viewRange, setViewRange] = useState({
    min: Math.max(GLOBAL_MIN, initialState.year - (initialState.span / 2)),
    max: Math.min(GLOBAL_MAX, initialState.year + (initialState.span / 2))
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
  const [interactionMode, setInteractionMode] = useState<'exploration' | 'investigation' | 'playback'>('exploration');
  // [NEW] Shared Hover State for Maps and Timeline
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // [NEW] Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

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
    updateUrl({ lat: mapViewport.lat, lng: mapViewport.lng, zoom: mapViewport.zoom, year: currentDate, span: viewRange.max - viewRange.min });
  }, [currentDate, viewRange, mapViewport, updateUrl]);


  // --- 3. Logic Pipelines ---

  // Data Fetching Pipeline
  const { allVisibleEvents, allLoadedEvents, isLoading } = useEventData(
    mapBounds,
    mapViewport.zoom,
    dataset,
    selectedCollection
  );

  // LOD Calculation Pipeline
  const lodThreshold = useLOD(viewRange, mapViewport.zoom);

  // Filtering Pipeline
  const { spatiallyFilteredEvents, renderableEvents: baseRenderableEvents } = useEventFilter(
    allVisibleEvents,
    mapBounds,
    lodThreshold,
    selectedEvent?.id
  );

  // [NEW] Playback Filtering: Only show events that have "happened" (start <= currentDate)
  // But strictly filtering `renderableEvents` might cause popping.
  const renderableEvents = useMemo(() => {
    // Base set from LOD
    let result = baseRenderableEvents;

    // [FIX] Ensure Expanded OR Played Events are ALWAYS rendered (bypass LOD)
    if (expandedEventIds.size > 0 || playedEventIds.size > 0) {
      const missing = spatiallyFilteredEvents.filter(
        e => (expandedEventIds.has(e.id) || playedEventIds.has(e.id)) && !result.some(r => r.id === e.id)
      );
      if (missing.length > 0) {
        result = [...result, ...missing];
      }
    }

    if (interactionMode === 'playback') {
      // Playback Mode: Persistent Dots (Curtain Effect)
      return result.filter(e => e.start.year <= currentDate && e.start.year >= viewRange.min);
    }

    if (interactionMode === 'investigation') {
      // Investigation Mode: Transient Dots (Only visible when thumb is near)
      const span = viewRange.max - viewRange.min;
      const threshold = span * 0.01; // 1% tolerance
      return result.filter(e => Math.abs(currentDate - e.start.year) <= threshold);
    }

    return result;
  }, [baseRenderableEvents, isPlaying, currentDate, interactionMode, viewRange.min, viewRange.max, expandedEventIds, spatiallyFilteredEvents, playedEventIds]);

  // [NEW] Manual Stepper Logic
  const handleManualStep = React.useCallback(() => {
    // Step aligned with Time Engine Zoom Scales
    const span = viewRange.max - viewRange.min;
    let stepSize = ZOOM_SCALES.MONTH;

    if (span >= ZOOM_SCALES.MILLENNIUM * 2) stepSize = ZOOM_SCALES.CENTURY;
    else if (span >= ZOOM_SCALES.CENTURY * 2) stepSize = ZOOM_SCALES.DECADE;
    else if (span >= ZOOM_SCALES.DECADE * 2) stepSize = ZOOM_SCALES.YEAR;

    setCurrentDate(prev => {
      const nextDate = prev + stepSize;

      if (nextDate > viewRange.max) {
        setIsPlaying(false);
        return viewRange.max;
      }

      // Event Activation Logic
      // [FIX] Scan spatiallyFilteredEvents (includes low importance) so we activate even small events
      const newActiveEvents = spatiallyFilteredEvents.filter(e =>
        e.start.year > prev && e.start.year <= nextDate
      );

      if (newActiveEvents.length > 0) {
        setExpandedEventIds(prevSet => {
          const next = new Set(prevSet);
          newActiveEvents.forEach(e => next.add(e.id));
          return next;
        });

        // [FIX] Add to Played Events (Persistent Dots)
        setPlayedEventIds(prevSet => {
          const next = new Set(prevSet);
          newActiveEvents.forEach(e => next.add(e.id));
          return next;
        });

        // Schedule Auto-Close for events without end date (2 seconds)
        newActiveEvents.forEach(event => {
          const hasDuration = event.end && event.end.year > event.start.year;
          if (!hasDuration) {
            setTimeout(() => {
              setExpandedEventIds(current => {
                const next = new Set(current);
                next.delete(event.id);
                return next;
              });
            }, 2000);
          }
        });
      }

      // Collapse Events with End Dates that have passed
      setExpandedEventIds(prevSet => {
        const next = new Set(prevSet);
        let changed = false;
        prevSet.forEach(id => {
          const event = baseRenderableEvents.find(e => e.id === id);
          if (event && event.end && event.end.year <= nextDate) {
            next.delete(id);
            changed = true;
          }
        });
        return changed ? next : prevSet;
      });

      return nextDate;
    });
  }, [viewRange, spatiallyFilteredEvents, baseRenderableEvents]);

  // [NEW] Auto-Play Loop
  useEffect(() => {
    if (interactionMode !== 'playback' || !isPlaying) return;

    const interval = setInterval(() => {
      handleManualStep();
    }, 1000);

    return () => clearInterval(interval);
  }, [interactionMode, isPlaying, handleManualStep]);

  // Interaction Interrupts Play Mode
  useEffect(() => {
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [mapViewport, viewRange]);





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
          fetchedCount={allVisibleEvents.length}
          renderedCount={renderableEvents.length}
          isGlobalViewGuess={isGlobalViewGuess}
          activeEvents={renderableEvents}
          expandedEventIds={expandedEventIds}
        />
      )}

      <CollectionsSidebar
        selectedCollection={selectedCollection}
        onSelect={setSelectedCollection}
        dataset={dataset}
      />

      <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl px-5 py-3 pointer-events-auto border border-white/50 flex items-center gap-3">
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <MapIcon className="text-blue-600 w-6 h-6" />
              Sail
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Beta</span>
            </h1>



            {isLoading && (
              <div className="flex items-center gap-2 px-2 border-l border-slate-200">
                <Loader2 className="animate-spin text-blue-500 w-4 h-4" />
                <span className="text-xs text-slate-500 font-medium">Updating...</span>
              </div>
            )}

            {dataset !== 'prod' && (
              <span className={`text-[10px] font-mono px-1 rounded border uppercase tracking-wider
                ${dataset === 'staging'
                  ? 'text-blue-600 bg-blue-100 border-blue-200'
                  : 'text-orange-600 bg-orange-100 border-orange-200'
                }
              `}>
                DATA: {dataset.toUpperCase()}
              </span>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              onClick={toggleTheme}
              className="bg-white/90 backdrop-blur-md p-2.5 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-white/50"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <button className="bg-white/90 backdrop-blur-md p-2.5 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-white/50">
              <Layers size={20} />
            </button>
            <div className="flex flex-col gap-px bg-white/90 backdrop-blur-md rounded-full shadow-sm border border-white/50 overflow-hidden">
              <button
                onClick={() => handleZoomClick('in')}
                className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all"
              >
                <Plus size={20} />
              </button>
              <div className="h-px bg-slate-200 mx-2" />
              <button
                onClick={() => handleZoomClick('out')}
                className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all"
              >
                <Minus size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

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
        />
      </main>

      <TimeControl
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
      />

      <EventDetailPanel
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
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