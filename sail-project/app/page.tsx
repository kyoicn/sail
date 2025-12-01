"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Map as MapIcon, Layers } from 'lucide-react';

import { EventData, MapBounds } from '../types';
import { MOCK_EVENTS } from '../lib/constants';
import { LeafletMap } from '../components/map/LeafletMap';
import { TimeControl } from '../components/timeline/TimeControl';
import { useUrlSync } from '../hooks/useUrlSync';
import { EventDetailPanel } from '../components/panel/EventDetailPanel';

export default function ChronoMapPage() {
  // Constants
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024; 

  // 1. Setup URL Sync Hook
  const { getInitialState, updateUrl } = useUrlSync({
    lat: 48.8566,
    lng: 2.3522,
    zoom: 11,
    year: 2024,
    span: GLOBAL_MAX - GLOBAL_MIN
  });

  const initialState = getInitialState();

  // 2. State Management
  const [currentDate, setCurrentDate] = useState(initialState.year);
  
  // Calculate initial view range
  const initialMin = Math.max(GLOBAL_MIN, initialState.year - (initialState.span / 2));
  const initialMax = Math.min(GLOBAL_MAX, initialState.year + (initialState.span / 2));
  
  const [viewRange, setViewRange] = useState({ min: initialMin, max: initialMax });
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  
  // Track Map Viewport for URL updates and LOD calculation
  const [mapViewport, setMapViewport] = useState({ 
      lat: initialState.lat, 
      lng: initialState.lng, 
      zoom: initialState.zoom 
  });

  // Selected Event for the Details Panel
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);

  // 3. Effect: Trigger URL Update when key states change
  useEffect(() => {
      updateUrl({
          lat: mapViewport.lat,
          lng: mapViewport.lng,
          zoom: mapViewport.zoom,
          year: currentDate,
          span: viewRange.max - viewRange.min
      });
  }, [currentDate, viewRange, mapViewport, updateUrl]);

  // 4. Logic: Level of Detail (LOD) Threshold Calculation
  // We use a "Weighted Average" strategy to balance performance and information density.
  const lodThreshold = useMemo(() => {
      // A. Time Dimension Threshold
      // The wider the time span, the higher the importance required to be seen.
      const timeSpan = viewRange.max - viewRange.min;
      let timeLOD = 1;
      if (timeSpan > 2000) timeLOD = 9;      // Global History view
      else if (timeSpan > 1000) timeLOD = 8; // Millennia view
      else if (timeSpan > 500) timeLOD = 6;  // Centuries view
      else if (timeSpan > 100) timeLOD = 4;  // Era view
      else if (timeSpan > 50) timeLOD = 2;   // Lifetime view
      else timeLOD = 1;                      // Detail view

      // B. Space Dimension Threshold (Leaflet Zoom Levels)
      // The lower the zoom (zoomed out), the higher the importance required.
      const zoom = mapViewport.zoom;
      let mapLOD = 1;
      if (zoom < 3) mapLOD = 9;       // Whole World view
      else if (zoom < 5) mapLOD = 8;  // Continent view
      else if (zoom < 6) mapLOD = 6;  // Large Region view
      else if (zoom < 8) mapLOD = 4;  // Country view
      else if (zoom < 10) mapLOD = 2; // State/Province view
      else mapLOD = 1;                // City/Street view

      // C. Strategy: Weighted Average
      // If we used MIN(time, map), a 1945 World View would crash with 10k events.
      // If we used MAX(time, map), a 1945 World View would be empty (only top events).
      // Average provides a safe middle ground.
      return Math.floor((timeLOD + mapLOD) / 2);
  }, [viewRange, mapViewport.zoom]);

  // 5. Data Pipeline: Filtering
  const filteredEvents = useMemo(() => {
      if (!mapBounds) return MOCK_EVENTS;
      
      return MOCK_EVENTS.filter(event => {
          // A. Spatial Filter (Is it on screen?)
          const inBounds = (
            event.location.lat <= mapBounds.north &&
            event.location.lat >= mapBounds.south &&
            event.location.lng >= mapBounds.west && 
            event.location.lng <= mapBounds.east
          );

          // B. Importance (LOD) Filter
          // Rule: Show if it meets the threshold OR if it is currently selected.
          // (We never want the selected event to disappear just because we zoomed out)
          const isSelected = selectedEvent?.id === event.id;
          const meetsImportance = event.importance >= lodThreshold;

          return inBounds && (meetsImportance || isSelected);
      });
  }, [mapBounds, lodThreshold, selectedEvent]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100">
      
      {/* Header Layer */}
      <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl px-5 py-3 pointer-events-auto border border-white/50">
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <MapIcon className="text-blue-600 w-6 h-6" />
              Sail
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Frontend Demo</span>
            </h1>
          </div>
          
          <div className="pointer-events-auto">
             <button className="bg-white/90 backdrop-blur-md p-2.5 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-white/50">
                <Layers size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* Map Layer */}
      <main className="flex-grow relative z-0">
        <LeafletMap 
          currentDate={currentDate} 
          events={filteredEvents} 
          viewRange={viewRange}
          jumpTargetId={jumpTargetId}
          onBoundsChange={setMapBounds}
          initialCenter={{ lat: initialState.lat, lng: initialState.lng }}
          initialZoom={initialState.zoom}
          onViewportChange={(center, zoom) => setMapViewport({ ...center, zoom })}
          onEventSelect={(event) => setSelectedEvent(event)}
        />
      </main>

      {/* Timeline Control Layer */}
      <TimeControl 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate}
        viewRange={viewRange}
        setViewRange={setViewRange}
        globalMin={GLOBAL_MIN}
        globalMax={GLOBAL_MAX}
        events={filteredEvents}      // Filtered list: Used to calculate active/visible status
        allEvents={MOCK_EVENTS}      // Full list: Passed to keep nodes mounted for animation
        setJumpTargetId={setJumpTargetId}
      />

      {/* Detail Panel Layer */}
      <EventDetailPanel 
        event={selectedEvent}
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

    </div>
  );
}