"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Map as MapIcon, Layers, Loader2 } from 'lucide-react';
import useSWR from 'swr'; 

import { EventData, MapBounds } from '../types';
import { LeafletMap } from '../components/map/LeafletMap';
import { TimeControl } from '../components/timeline/TimeControl';
import { useUrlSync } from '../hooks/useUrlSync';
import { EventDetailPanel } from '../components/panel/EventDetailPanel';
import { DebugHUD } from '../components/debug/DebugHUD'; // [NEW]

// SWR Fetcher
const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ChronoMapPage() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024; 

  // 1. URL Sync
  const { getInitialState, updateUrl } = useUrlSync({
    lat: 48.8566,
    lng: 2.3522,
    zoom: 11,
    year: 2024,
    span: GLOBAL_MAX - GLOBAL_MIN
  });

  const initialState = getInitialState();

  // 2. State
  const [currentDate, setCurrentDate] = useState(initialState.year);
  const initialMin = Math.max(GLOBAL_MIN, initialState.year - (initialState.span / 2));
  const initialMax = Math.min(GLOBAL_MAX, initialState.year + (initialState.span / 2));
  
  const [viewRange, setViewRange] = useState({ min: initialMin, max: initialMax });
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  
  const [mapViewport, setMapViewport] = useState({ 
      lat: initialState.lat, 
      lng: initialState.lng, 
      zoom: initialState.zoom 
  });

  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);

  // 3. Effect: URL Update
  useEffect(() => {
      updateUrl({
          lat: mapViewport.lat,
          lng: mapViewport.lng,
          zoom: mapViewport.zoom,
          year: currentDate,
          span: viewRange.max - viewRange.min
      });
  }, [currentDate, viewRange, mapViewport, updateUrl]);

  // 4. DATA FETCHING
  const queryKey = mapBounds 
    ? `/api/events?n=${mapBounds.north}&s=${mapBounds.south}&e=${mapBounds.east}&w=${mapBounds.west}&z=${mapViewport.zoom}` 
    : null;

  const { data: serverEvents, isLoading } = useSWR<EventData[]>(queryKey, fetcher, {
    keepPreviousData: true, 
    dedupingInterval: 10000, 
  });

  const allVisibleEvents = serverEvents || [];

  const [allLoadedEvents, setAllLoadedEvents] = useState<EventData[]>([]);

  useEffect(() => {
    if (serverEvents) {
        setAllLoadedEvents(prev => {
            const newItems = serverEvents.filter(n => !prev.find(p => p.id === n.id));
            if (newItems.length === 0) return prev;
            return [...prev, ...newItems];
        });
    }
  }, [serverEvents]);

  // 5. Logic: LOD Threshold Calculation
  const lodThreshold = useMemo(() => {
      const timeSpan = viewRange.max - viewRange.min;
      let timeLOD = 1;
      if (timeSpan > 2000) timeLOD = 9;      
      else if (timeSpan > 1000) timeLOD = 8; 
      else if (timeSpan > 500) timeLOD = 6;  
      else if (timeSpan > 100) timeLOD = 4;  
      else if (timeSpan > 50) timeLOD = 2;   
      else timeLOD = 1;                      

      const zoom = mapViewport.zoom;
      let mapLOD = 1;
      if (zoom < 3) mapLOD = 9;       
      else if (zoom < 5) mapLOD = 8;  
      else if (zoom < 6) mapLOD = 6;  
      else if (zoom < 8) mapLOD = 4;  
      else if (zoom < 10) mapLOD = 2; 
      else mapLOD = 1;                

      return Math.floor((timeLOD + mapLOD) / 2);
  }, [viewRange, mapViewport.zoom]);

  // 6. Data Pipeline: Filter Logic
  const spatiallyFilteredEvents = useMemo(() => {
      if (!mapBounds) return [];
      
      const { west, east, north, south } = mapBounds;
      const lngSpan = east - west;
      const isGlobalView = lngSpan >= 360; 
      const mapCenterLng = (west + east) / 2;

      return allVisibleEvents.filter(event => {
          if (event.location.lat > north || event.location.lat < south) return false;
          if (isGlobalView) return true;

          const lng = event.location.lng;
          const offset = Math.round((mapCenterLng - lng) / 360);
          const projectedLng = lng + (offset * 360);

          return projectedLng >= west && projectedLng <= east;
      });
  }, [mapBounds, allVisibleEvents]);

  const renderableEvents = useMemo(() => {
      return spatiallyFilteredEvents.filter(event => {
          const isSelected = selectedEvent?.id === event.id;
          const meetsImportance = event.importance >= lodThreshold;
          return meetsImportance || isSelected;
      });
  }, [spatiallyFilteredEvents, lodThreshold, selectedEvent]);

  // [NEW] Debug Helper Calculation
  const isGlobalViewGuess = useMemo(() => {
      if (!mapBounds) return false;
      const lngSpan = mapBounds.east - mapBounds.west;
      // Replicates the logic in route.ts roughly
      return mapViewport.zoom < 5.5 || lngSpan >= 300 || (mapBounds.west <= -180 && mapBounds.east >= 180);
  }, [mapBounds, mapViewport.zoom]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100">
      
      {/* [NEW] DEBUG HUD (Top Right) */}
      <DebugHUD 
        zoom={mapViewport.zoom}
        center={mapViewport}
        bounds={mapBounds}
        lodThreshold={lodThreshold}
        fetchedCount={allVisibleEvents.length}
        renderedCount={renderableEvents.length}
        isGlobalViewGuess={isGlobalViewGuess}
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
          </div>
          <div className="pointer-events-auto">
             <button className="bg-white/90 backdrop-blur-md p-2.5 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-white/50">
                <Layers size={20} />
             </button>
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
      />

      <EventDetailPanel 
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

    </div>
  );
}