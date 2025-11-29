"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, ChevronRight, ChevronLeft, Map as MapIcon, Calendar, Info } from 'lucide-react';

// --- 1. Mock Data ---
// In a production environment, this data would come from Firestore
const MOCK_EVENTS = [
  { id: '1', title: 'Construction of the Great Pyramid', year: -2560, lat: 29.9792, lng: 31.1342, summary: 'The Great Pyramid of Giza is completed in Egypt, serving as the tomb of Pharaoh Khufu.' },
  { id: '2', title: 'Code of Hammurabi', year: -1750, lat: 32.5363, lng: 44.4208, summary: 'The Babylonian King Hammurabi issues one of the world\'s earliest written codes of law.' },
  { id: '3', title: 'Trojan War', year: -1184, lat: 39.9575, lng: 26.2389, summary: 'According to legend, the Greeks capture the city of Troy using the Trojan Horse.' },
  { id: '4', 'title': 'First Olympic Games', year: -776, lat: 37.6385, lng: 21.6300, summary: 'The first recorded ancient Olympic Games are held in Olympia, Greece.' },
  { id: '5', title: 'Founding of Rome', year: -753, lat: 41.8902, lng: 12.4922, summary: 'Legend says Romulus founds the city of Rome, beginning the Roman Kingdom era.' },
  { id: '6', title: 'Birth of Confucius', year: -551, lat: 35.5907, lng: 116.9856, summary: 'Confucius, the great Chinese thinker and educator, is born in the State of Lu.' },
  { id: '7', title: 'Alexander\'s Conquests', year: -334, lat: 40.7128, lng: 22.5694, summary: 'Alexander the Great begins his eastern campaign, establishing a vast empire across Europe, Asia, and Africa.' },
  { id: '8', title: 'Qin Shi Huang Unifies China', year: -221, lat: 34.3416, lng: 108.9398, summary: 'King Ying Zheng of Qin unifies China, establishing the Qin Dynasty and proclaiming himself the First Emperor (Shi Huangdi).' },
  { id: '9', title: 'Assassination of Caesar', year: -44, lat: 41.8902, lng: 12.4922, summary: 'Julius Caesar is assassinated in the Roman Senate.' },
  { id: '10', title: 'Birth of Jesus (Approx.)', year: 1, lat: 31.7054, lng: 35.2024, summary: 'Traditionally considered the time of Jesus\' birth, marking the start of the Common Era.' },
  { id: '11', title: 'Fall of Constantinople', year: 1453, lat: 41.0082, lng: 28.9784, summary: 'The Ottoman Empire captures Constantinople, leading to the collapse of the Byzantine Empire.' },
  { id: '12', title: 'Columbus Reaches the Americas', year: 1492, lat: 25.0343, lng: -77.3963, summary: 'Christopher Columbus arrives in the Americas, beginning the Age of Exploration.' },
  { id: '13', title: 'Declaration of Independence (US)', year: 1776, lat: 39.9526, lng: -75.1652, summary: 'The thirteen North American colonies sign the Declaration of Independence, announcing separation from British rule.' },
  { id: '14', title: 'French Revolution Begins', year: 1789, lat: 48.8566, lng: 2.3522, summary: 'The storming of the Bastille by the people of Paris marks the beginning of the French Revolution.' },
  { id: '15', title: 'Meiji Restoration', year: 1868, lat: 35.6762, lng: 139.6503, summary: 'Japan begins the Meiji Restoration, rapidly moving toward modernization.' },
  { id: '16', title: 'End of World War I', year: 1918, lat: 49.4296, lng: 2.8272, summary: 'Germany signs the Armistice, marking the end of World War I.' },
  { id: '17', title: 'Apollo 11 Moon Landing', year: 1969, lat: 28.5721, lng: -80.6480, summary: 'Neil Armstrong becomes the first human to walk on the Moon.' },
  { id: '18', title: 'Fall of the Berlin Wall', year: 1989, lat: 52.5163, lng: 13.3777, summary: 'The Berlin Wall, a symbol of Cold War division, is torn down.' },
  { id: '19', title: 'Dot-com Bubble Bursts', year: 2000, lat: 37.7749, lng: -122.4194, summary: 'Internet company stock prices crash, but also signals the deep adoption of the digital age.' },
  { id: '20', title: 'Beijing Olympics', year: 2008, lat: 39.9042, lng: 116.4074, summary: 'China hosts the Summer Olympic Games for the first time.' }
];

// --- 2. Helper Component: Leaflet Map Loader ---
// To run Leaflet in a single file, we dynamically load CSS and JS using useEffect
const LeafletMap = ({ currentDate, events }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Initialize the map
  useEffect(() => {
    // Check if Leaflet scripts are already loaded
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    } else if (window.L) {
      initMap();
    }

    function initMap() {
      if (mapRef.current && !mapInstanceRef.current && window.L) {
        // Create map instance
        const map = window.L.map(mapRef.current).setView([20, 0], 2);
        
        // Add base layer (OpenStreetMap)
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        mapInstanceRef.current = map;
      }
    }

    // Cleanup function
    return () => {
      // In a real React project, the map should be destroyed here.
      // But in a hot-reloading environment, we keep the instance to avoid flickering
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;

    // 1. Clear old markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // 2. Filter events visible at the current time point
    // Logic: show events within +/- 50 years of the current year
    const visibleEvents = events.filter(event => 
      Math.abs(event.year - currentDate) <= 50 // The range is set wider for demonstration purposes
    );

    // 3. Add new markers
    visibleEvents.forEach(event => {
      // Helper function for year display in popup
      const getYearDisplay = (year) => {
        if (year < 0) return `BC ${Math.abs(year)}`;
        if (year === 0) return `AD 1`; // There is no year 0 in the common era calendar
        return `AD ${year}`;
      };

      const marker = window.L.marker([event.lat, event.lng])
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family: sans-serif;">
            <h3 style="margin: 0 0 5px 0; font-weight: bold;">${event.title}</h3>
            <p style="margin: 0; color: #666; font-size: 0.9em;">${getYearDisplay(event.year)}</p>
            <p style="margin: 5px 0 0 0;">${event.summary}</p>
          </div>
        `);
      
      markersRef.current.push(marker);
    });

  }, [currentDate, events]); // Re-render markers when the date changes

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};

// --- 3. Helper Component: Timeline Slider ---
const TimeControl = ({ currentDate, setCurrentDate, minYear, maxYear }) => {
  // Format year display
  const formatYear = (year) => {
    if (year < 0) return `BC ${Math.abs(year)}`;
    if (year === 0) return `AD 1`;
    return `${year} AD`;
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-6 z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
        
        {/* Current Year Display - Main Title */}
        <div className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Calendar className="w-6 h-6 text-blue-600" />
          {formatYear(currentDate)}
        </div>

        {/* Range labels */}
        <div className="w-full flex justify-between text-xs text-slate-400 font-medium px-1">
          <span>{formatYear(minYear)}</span>
          <span>{formatYear(maxYear)}</span>
        </div>

        {/* Slider core */}
        <div className="relative w-full h-12 flex items-center">
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={currentDate}
            onChange={(e) => setCurrentDate(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700 transition-all"
          />
        </div>

        {/* Fine-tuning buttons (simplified version of "changing resolution") */}
        <div className="flex gap-4">
          <button 
            onClick={() => setCurrentDate(prev => Math.max(minYear, prev - 10))}
            className="px-4 py-2 bg-white border border-slate-300 rounded-full text-sm font-medium hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-1"
          >
            <ChevronLeft size={16} /> 10 Years
          </button>
          <button 
            onClick={() => setCurrentDate(prev => Math.min(maxYear, prev + 10))}
            className="px-4 py-2 bg-white border border-slate-300 rounded-full text-sm font-medium hover:bg-slate-50 active:scale-95 transition-all shadow-sm flex items-center gap-1"
          >
            +10 Years <ChevronRight size={16} />
          </button>
        </div>
        
        <p className="text-xs text-slate-400 mt-2">
          💡 Tip: Slide the timeline to travel through time and view major events.
        </p>
      </div>
    </div>
  );
};

// --- 4. Main Application Component (Main App) ---
export default function App() {
  const [currentDate, setCurrentDate] = useState(-500); // Initial year set to 500 BC
  const MIN_YEAR = -3000;
  const MAX_YEAR = 2024;

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      
      {/* Top Navigation Bar */}
      <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          <div className="bg-white/90 backdrop-blur shadow-lg rounded-2xl px-5 py-3 pointer-events-auto border border-slate-100/50">
            <h1 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
              <MapIcon className="text-blue-600" />
              Sail
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Alpha</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">Exploring the Spatio-temporal Map of Human History</p>
          </div>

          <div className="bg-white/90 backdrop-blur shadow-lg rounded-full p-2 pointer-events-auto hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100/50">
            <Info className="text-slate-600" />
          </div>
        </div>
      </header>

      {/* Map Area (Background) */}
      <main className="flex-grow relative z-0">
        <LeafletMap 
          currentDate={currentDate} 
          events={MOCK_EVENTS}
        />
        
        {/* Decorative overlay (vignette) */}
        <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.1)] z-10" />
      </main>

      {/* Bottom Time Control Bar */}
      <TimeControl 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate}
        minYear={MIN_YEAR}
        maxYear={MAX_YEAR}
      />

    </div>
  );
}