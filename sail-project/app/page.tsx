"use client";

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { Map as MapIcon, Layers, Loader2, Plus, Minus } from 'lucide-react';

import { EventData, MapBounds } from '../types';
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

function ChronoMapContent() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024;

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
  const [zoomAction, setZoomAction] = useState<{ type: 'in' | 'out', id: number } | null>(null);
  const [interactionMode, setInteractionMode] = useState<'exploration' | 'investigation'>('exploration');

  const handleZoomClick = (type: 'in' | 'out') => {
    setZoomAction({ type, id: Date.now() });
  };

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
  const { spatiallyFilteredEvents, renderableEvents } = useEventFilter(
    allVisibleEvents,
    mapBounds,
    lodThreshold,
    selectedEvent?.id
  );

  // Debug Info
  const isGlobalViewGuess = useMemo(() => {
    if (!mapBounds) return false;
    return mapViewport.zoom < 5.5 || (mapBounds.east - mapBounds.west) >= 300;
  }, [mapBounds, mapViewport.zoom]);


  // --- 4. View Layer ---
  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100">

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
              <span className="text-[10px] font-mono text-orange-600 bg-orange-100 px-1 rounded border border-orange-200">
                DATA: {dataset.toUpperCase()}
              </span>
            )}
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
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