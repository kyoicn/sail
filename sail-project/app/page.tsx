"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Map as MapIcon, Layers } from 'lucide-react';

import { EventData, MapBounds } from '../types';
import { MOCK_EVENTS } from '../lib/constants';
import { LeafletMap } from '../components/map/LeafletMap';
import { TimeControl } from '../components/timeline/TimeControl';
import { useUrlSync } from '../hooks/useUrlSync';

export default function ChronoMapPage() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024; 

  const { getInitialState, updateUrl } = useUrlSync({
    lat: 48.8566,
    lng: 2.3522,
    zoom: 11,
    year: 2024,
    span: GLOBAL_MAX - GLOBAL_MIN
  });

  const initialState = getInitialState();

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

  useEffect(() => {
      updateUrl({
          lat: mapViewport.lat,
          lng: mapViewport.lng,
          zoom: mapViewport.zoom,
          year: currentDate,
          span: viewRange.max - viewRange.min
      });
  }, [currentDate, viewRange, mapViewport, updateUrl]);

  const filteredEvents = useMemo(() => {
      if (!mapBounds) return MOCK_EVENTS;
      
      return MOCK_EVENTS.filter(event => {
          return (
            event.location.lat <= mapBounds.north &&
            event.location.lat >= mapBounds.south &&
            event.location.lng >= mapBounds.west && 
            event.location.lng <= mapBounds.east
          );
      });
  }, [mapBounds]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100">
      
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
        />
      </main>

      <TimeControl 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate}
        viewRange={viewRange}
        setViewRange={setViewRange}
        globalMin={GLOBAL_MIN}
        globalMax={GLOBAL_MAX}
        events={filteredEvents}      // Filtered list: Used to calculate visibility status
        allEvents={MOCK_EVENTS}      // [NEW] Full list: Passed to keep nodes mounted for animation
        setJumpTargetId={setJumpTargetId}
      />
    </div>
  );
}