"use client";

import React, { useState, useMemo } from 'react';
import { Map as MapIcon, Layers } from 'lucide-react';

// --- Imports from our new modular architecture ---
import { EventData, MapBounds } from '../types';
import { MOCK_EVENTS } from '../lib/constants';
import { LeafletMap } from '../components/map/LeafletMap';
import { TimeControl } from '../components/timeline/TimeControl';

export default function ChronoMapPage() {
  // 1. Constants configuration
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024; 

  // 2. Global State Management
  // Current time pointer (year)
  const [currentDate, setCurrentDate] = useState(2024); 
  
  // The visible time range on the timeline
  const [viewRange, setViewRange] = useState({ min: GLOBAL_MIN, max: GLOBAL_MAX });
  
  // Controls the "Jump to Event" animation state
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  
  // 3. Spatial Filter State
  // Tracks the current lat/lng boundaries of the map viewport
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  // 4. Data Pipeline
  // Only pass events that are geographically inside the current screen
  const filteredEvents = useMemo(() => {
      if (!mapBounds) return MOCK_EVENTS;
      
      return MOCK_EVENTS.filter(event => {
          return (
            event.location.lat <= mapBounds.north &&
            event.location.lat >= mapBounds.south &&
            // FIX: Longitude logic was inverted. 
            // Valid lng must be > West (left) AND < East (right)
            event.location.lng >= mapBounds.west && 
            event.location.lng <= mapBounds.east
          );
      });
  }, [mapBounds]);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100">
      
      {/* --- A. Header Layer --- */}
      <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          {/* Logo / Title */}
          <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl px-5 py-3 pointer-events-auto border border-white/50">
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <MapIcon className="text-blue-600 w-6 h-6" />
              Sail
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Frontend Demo</span>
            </h1>
          </div>
          
          {/* Menu / Settings */}
          <div className="pointer-events-auto">
             <button className="bg-white/90 backdrop-blur-md p-2.5 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-white/50">
                <Layers size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* --- B. Map Layer --- */}
      <main className="flex-grow relative z-0">
        <LeafletMap 
          currentDate={currentDate} 
          events={filteredEvents} 
          viewRange={viewRange}
          jumpTargetId={jumpTargetId}
          onBoundsChange={setMapBounds}
        />
      </main>

      {/* --- C. Control Layer --- */}
      <TimeControl 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate}
        viewRange={viewRange}
        setViewRange={setViewRange}
        globalMin={GLOBAL_MIN}
        globalMax={GLOBAL_MAX}
        events={filteredEvents}
        setJumpTargetId={setJumpTargetId}
      />
    </div>
  );
}