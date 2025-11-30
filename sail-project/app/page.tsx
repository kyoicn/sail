"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronLeft, Map as MapIcon, Layers, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

// --- Types ---

interface ChronosTime {
  year: number;
  month?: number;
  day?: number;
  precision: 'year' | 'month' | 'day'; 
}

interface EventData {
  id: string;
  title: string;
  start: ChronosTime;
  end?: ChronosTime;
  lat: number;
  lng: number;
  summary: string;
  imageUrl?: string;
  locationPrecision?: 'exact' | 'city' | 'country';
}

// --- 1. Mock Data ---
const MOCK_EVENTS: EventData[] = [
  { 
    id: '1', 
    title: 'Great Pyramid Completed', 
    start: { year: -2560, precision: 'year' },
    lat: 29.9792, 
    lng: 31.1342, 
    summary: 'The Great Pyramid of Giza is completed as the tomb of Pharaoh Khufu.',
    locationPrecision: 'exact',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg'
  },
  { 
    id: '2', 
    title: 'Code of Hammurabi', 
    start: { year: -1750, precision: 'year' },
    lat: 32.5363, 
    lng: 44.4208, 
    summary: 'King Hammurabi issues one of the earliest codes of law.',
    locationPrecision: 'city'
  },
  { 
    id: '7', 
    title: 'Alexander\'s Conquests', 
    start: { year: -334, precision: 'year' },
    end: { year: -323, precision: 'year' },
    lat: 40.7128, 
    lng: 22.5694, 
    summary: 'Alexander the Great creates one of the largest empires in history.',
    locationPrecision: 'country'
  },
  { 
    id: '9', 
    title: 'Assassination of Caesar', 
    start: { year: -44, month: 3, day: 15, precision: 'day' },
    lat: 41.8902, 
    lng: 12.4922, 
    summary: 'Julius Caesar is assassinated in the Roman Senate.',
    locationPrecision: 'exact',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Retrato_de_Julio_C%C3%A9sar_%2826724083101%29.jpg/367px-Retrato_de_Julio_C%C3%A9sar_%2826724083101%29.jpg'
  },
  { 
    id: '12', 
    title: 'Columbus Reaches Americas', 
    start: { year: 1492, month: 10, day: 12, precision: 'day' },
    lat: 25.0343, 
    lng: -77.3963, 
    summary: 'Christopher Columbus arrives in the Americas.',
    locationPrecision: 'exact'
  },
  { 
    id: '16', 
    title: 'World War I', 
    start: { year: 1914, month: 7, day: 28, precision: 'day' },
    end: { year: 1918, month: 11, day: 11, precision: 'day' },
    lat: 50.8503, 
    lng: 4.3517, 
    summary: 'A global conflict originating in Europe.',
    locationPrecision: 'country',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Soldiers_of_the_Australian_4th_Division_in_the_field_at_Hooge%2C_Belgium%2C_29_October_1917.jpg/640px-Soldiers_of_the_Australian_4th_Division_in_the_field_at_Hooge%2C_Belgium%2C_29_October_1917.jpg'
  },
  { 
    id: '17', 
    title: 'Apollo 11 Moon Landing', 
    start: { year: 1969, month: 7, day: 20, precision: 'day' },
    lat: 28.5721, 
    lng: -80.6480, 
    summary: 'Neil Armstrong becomes the first human to walk on the Moon.',
    locationPrecision: 'exact',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Aldrin_Apollo_11_original.jpg/600px-Aldrin_Apollo_11_original.jpg'
  }
];

// --- Helper Functions ---

const getMonthName = (month: number) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[month - 1] || "";
};

const formatNaturalDate = (floatYear: number, span: number): string => {
  const year = Math.floor(floatYear);
  const fraction = floatYear - year;
  const dayOfYear = Math.floor(fraction * 365.25);
  const date = new Date(year, 0); 
  date.setDate(dayOfYear + 1); 
  
  const month = date.getMonth() + 1; 
  const day = date.getDate(); 

  const yearStr = year < 0 ? `${Math.abs(year)} BC` : `${year}`;

  if (span > 1000) {
    return yearStr;
  } else if (span > 20) {
    return `${getMonthName(month)} ${yearStr}`;
  } else {
    return `${getMonthName(month)} ${day}, ${yearStr}`;
  }
};

const formatChronosTime = (time: ChronosTime): string => {
  const yearStr = time.year < 0 ? `${Math.abs(time.year)} BC` : `${time.year}`;
  if (time.precision === 'day' && time.month && time.day) {
    return `${getMonthName(time.month)} ${time.day}, ${yearStr}`;
  }
  return yearStr;
};

const formatYearSimple = (year: number): string => {
  const rounded = Math.round(year);
  if (rounded < 0) return `${Math.abs(rounded)} BC`;
  if (rounded === 0) return `1 AD`;
  return `${rounded}`;
};

const formatEventDateRange = (event: EventData): string => {
  const startStr = formatChronosTime(event.start);
  if (event.end) {
    const endStr = formatChronosTime(event.end);
    return `${startStr} – ${endStr}`;
  }
  return startStr;
};

// --- Component: Leaflet Map ---
const LeafletMap = ({ 
  currentDate, 
  events, 
  viewRange,
  jumpTargetId
}: { 
  currentDate: number, 
  events: EventData[], 
  viewRange: { min: number, max: number },
  jumpTargetId: string | null
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersMapRef = useRef<Map<string, any>>(new Map());

  const dynamicThreshold = Math.max(0.5, (viewRange.max - viewRange.min) / 100);

  useEffect(() => {
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
    } else if ((window as any).L) {
      initMap();
    }

    function initMap() {
      if (mapRef.current && !mapInstanceRef.current && (window as any).L) {
        const L = (window as any).L;
        const map = L.map(mapRef.current, {
           zoomControl: false, 
           attributionControl: false 
        }).setView([20, 0], 2);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);
        
        mapInstanceRef.current = map;
      }
    }
    return () => {};
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    const markersMap = markersMapRef.current;

    events.forEach(event => {
      let isActive = false;
      
      // LOGIC: If a jump is in progress, ONLY show the target event.
      // Otherwise, use normal proximity logic.
      if (jumpTargetId) {
        isActive = event.id === jumpTargetId;
      } else {
        if (event.end) {
          isActive = currentDate >= event.start.year && currentDate <= event.end.year;
        } else {
          isActive = Math.abs(currentDate - event.start.year) <= dynamicThreshold;
        }
      }

      if (isActive) {
        if (!markersMap.has(event.id)) {
          const htmlContent = `
            <div class="event-card-container" style="
                transform: translate(-50%, -100%); 
                margin-top: -10px;
                display: flex;
                flex-direction: column;
                align-items: center;
                pointer-events: none; 
            ">
                <div class="card" style="
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    width: 220px;
                    overflow: hidden;
                    font-family: system-ui;
                    pointer-events: auto; 
                    transition: transform 0.2s;
                ">
                    ${event.imageUrl ? `<div style="height: 100px; width: 100%; background-image: url('${event.imageUrl}'); background-size: cover; background-position: center;"></div>` : ''}
                    <div style="padding: 10px 12px;">
                        <div style="font-size: 14px; font-weight: 700; color: #111; margin-bottom: 4px; line-height: 1.2;">${event.title}</div>
                        <div style="display: flex; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                        </div>
                        <div style="font-size: 11px; color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${event.summary}
                        </div>
                    </div>
                </div>
                <div style="width: 2px; height: 10px; background: #3b82f6;"></div>
                <div style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
            </div>
          `;

          const icon = L.divIcon({
            className: '', 
            html: htmlContent,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          });

          const marker = L.marker([event.lat, event.lng], { icon, zIndexOffset: 100 }).addTo(map);
          
          const el = marker.getElement();
          if (el) {
             el.style.opacity = '1';
             el.style.display = 'block';
             el.style.transition = 'none'; 
          }
          markersMap.set(event.id, marker);
        } else {
          const marker = markersMap.get(event.id);
          const el = marker.getElement();
          if (el) {
             el.style.transition = 'none'; 
             el.style.opacity = '1';
             el.style.pointerEvents = 'auto'; 
             marker.setZIndexOffset(1000);
          }
        }
      } else {
        if (markersMap.has(event.id)) {
          const marker = markersMap.get(event.id);
          const el = marker.getElement();
          if (el) {
             el.style.transition = 'opacity 2s ease-out';
             el.style.opacity = '0';
             el.style.pointerEvents = 'none'; 
             marker.setZIndexOffset(0);
          }
        }
      }
    });

  }, [currentDate, events, dynamicThreshold, jumpTargetId]); // Added jumpTargetId dependency

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};

// --- Component: Zoomable Time Control ---
const TimeControl = ({ 
  currentDate, 
  setCurrentDate, 
  viewRange, 
  setViewRange,
  globalMin,
  globalMax,
  events,
  setJumpTargetId
}: { 
  currentDate: number, 
  setCurrentDate: (val: number) => void, 
  viewRange: { min: number, max: number },
  setViewRange: (range: { min: number, max: number }) => void,
  globalMin: number,
  globalMax: number,
  events: EventData[],
  setJumpTargetId: (id: string | null) => void
}) => {
  
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);

  const smoothJump = (targetDate: number, eventId: string) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    // 1. Set Jump Target ID to enter "Jump Mode" (suppress other events)
    setJumpTargetId(eventId);

    const startValue = currentDate;
    const distance = targetDate - startValue;
    const duration = 800; 
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const ease = 1 - Math.pow(1 - progress, 3);
      
      const nextValue = startValue + (distance * ease);
      setCurrentDate(nextValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        // 2. Animation finished: Exit "Jump Mode"
        setJumpTargetId(null);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const handleZoom = (zoomFactor: number) => {
    const currentSpan = viewRange.max - viewRange.min;
    const newSpan = currentSpan / zoomFactor;
    
    if (zoomFactor > 1 && newSpan < 10) return;
    if (zoomFactor < 1 && newSpan > (globalMax - globalMin)) {
        setViewRange({ min: globalMin, max: globalMax });
        return;
    }

    const newMin = Math.max(globalMin, currentDate - newSpan / 2);
    const newMax = Math.min(globalMax, newMin + newSpan);
    const finalMin = Math.max(globalMin, newMax - newSpan);

    setViewRange({ min: finalMin, max: newMax });
  };

  const handlePan = (direction: 'left' | 'right') => {
    const span = viewRange.max - viewRange.min;
    const shift = span * 0.2; 
    
    if (direction === 'left') {
        const newMin = Math.max(globalMin, viewRange.min - shift);
        const newMax = newMin + span;
        setViewRange({ min: newMin, max: newMax });
    } else {
        const newMax = Math.min(globalMax, viewRange.max + shift);
        const newMin = newMax - span;
        setViewRange({ min: newMin, max: newMax });
    }
  };

  const resetZoom = () => {
    setViewRange({ min: globalMin, max: globalMax });
  };

  const generateTicks = () => {
    const span = viewRange.max - viewRange.min;
    let tickCount = 5;
    let step = span / tickCount;
    
    if (step > 1000) step = 1000;
    else if (step > 500) step = 500;
    else if (step > 100) step = 100;
    else if (step > 50) step = 50;
    else if (step > 10) step = 10;
    else step = 1;

    const ticks = [];
    const startTick = Math.ceil(viewRange.min / step) * step;
    
    for (let t = startTick; t <= viewRange.max; t += step) {
        const percent = ((t - viewRange.min) / span) * 100;
        ticks.push({ year: t, left: percent });
    }
    return ticks;
  };

  const renderEventMarkers = () => {
    const span = viewRange.max - viewRange.min;
    const thumbPercent = ((currentDate - viewRange.min) / span) * 100;

    return events.map(event => {
        if (event.start.year < viewRange.min || event.start.year > viewRange.max) return null;
        
        const percent = ((event.start.year - viewRange.min) / span) * 100;
        const isHovered = hoveredEventId === event.id;
        
        // Hide marker if it overlaps with the slider thumb to prevent visual clutter
        // Assuming thumb is roughly 2-3% of width
        const isObscuredByThumb = Math.abs(percent - thumbPercent) < 1.5;

        return (
            <div 
                key={event.id}
                className={`group absolute top-1/2 -translate-y-1/2 w-1.5 h-3 cursor-pointer rounded-[1px] z-20 pointer-events-auto
                    ${isObscuredByThumb ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                    ${isHovered 
                        ? 'bg-blue-600 scale-125 shadow-sm border border-white z-30' 
                        : 'bg-slate-700/80 hover:bg-blue-500'
                    }`}
                style={{ left: `${percent}%` }}
                onMouseEnter={() => setHoveredEventId(event.id)}
                onMouseLeave={() => setHoveredEventId(null)}
                onClick={(e) => {
                    e.stopPropagation(); 
                    smoothJump(event.start.year, event.id); 
                }}
            >
                {isHovered && !isObscuredByThumb && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-[10px] font-medium rounded shadow-sm whitespace-nowrap pointer-events-none transition-opacity duration-200 opacity-100">
                        {event.title}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-800"></div>
                    </div>
                )}
            </div>
        );
    });
  };

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-4xl px-4 z-10">
      <div className="bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-6 transition-all hover:shadow-3xl">
        
        {/* Header: Controls & Date */}
        <div className="flex justify-between items-end mb-4">
            <div className="flex gap-2">
                <button 
                    onClick={resetZoom}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                    title="Reset View"
                >
                    <Maximize size={18} />
                </button>
            </div>

            <div className="flex flex-col items-center">
                <div className="text-4xl font-black text-slate-800 tracking-tight flex items-baseline gap-2 font-mono">
                    {formatNaturalDate(currentDate, viewRange.max - viewRange.min)}
                </div>
            </div>

            <div className="flex gap-2">
                <button 
                    onClick={() => handleZoom(0.5)}
                    className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm"
                    title="Zoom Out"
                >
                    <ZoomOut size={20} />
                </button>
                <button 
                    onClick={() => handleZoom(2)}
                    className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm"
                    title="Zoom In"
                >
                    <ZoomIn size={20} />
                </button>
            </div>
        </div>

        {/* Slider Area */}
        <div className="flex items-center gap-4">
            <button onClick={() => handlePan('left')} className="text-slate-400 hover:text-slate-600">
                <ChevronLeft size={24} />
            </button>

            <div className="text-xs font-mono font-bold text-slate-400 w-12 text-right">
                {formatYearSimple(viewRange.min)}
            </div>

            <div className="relative flex-grow h-12 flex items-center group">
                <div className="absolute top-8 w-full h-4">
                    {generateTicks().map((tick) => (
                        <div 
                            key={tick.year} 
                            className="absolute top-0 w-px h-2 bg-slate-300 flex flex-col items-center"
                            style={{ left: `${tick.left}%` }}
                        >
                            <span className="text-[10px] text-slate-400 mt-2 font-mono whitespace-nowrap">{formatYearSimple(tick.year)}</span>
                        </div>
                    ))}
                </div>

                <div className="absolute w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="w-full h-full bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 opacity-50"></div>
                </div>

                {/* Event Markers Layer */}
                <div className="absolute w-full h-full pointer-events-none">
                    {renderEventMarkers()}
                </div>
                
                {/* Input Range: Step set to 'any' for precise movement */}
                <input
                    type="range"
                    min={viewRange.min}
                    max={viewRange.max}
                    step="any"
                    value={currentDate}
                    onChange={(e) => {
                        if (animationRef.current) cancelAnimationFrame(animationRef.current);
                        // Clear jump target on manual drag
                        setJumpTargetId(null);
                        setCurrentDate(Number(e.target.value));
                    }}
                    className="w-full h-2 bg-transparent appearance-none cursor-pointer z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                />
            </div>

            <div className="text-xs font-mono font-bold text-slate-400 w-12 text-left">
                {formatYearSimple(viewRange.max)}
            </div>

            <button onClick={() => handlePan('right')} className="text-slate-400 hover:text-slate-600">
                <ChevronRight size={24} />
            </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024;

  const [currentDate, setCurrentDate] = useState(-500); 
  const [viewRange, setViewRange] = useState({ min: GLOBAL_MIN, max: GLOBAL_MAX });
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden relative selection:bg-blue-100">
      
      {/* Top Bar (Simplified) */}
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

      {/* Main Map */}
      <main className="flex-grow relative z-0">
        <LeafletMap 
          currentDate={currentDate} 
          events={MOCK_EVENTS} 
          viewRange={viewRange}
          jumpTargetId={jumpTargetId}
        />
      </main>

      {/* Bottom Controls */}
      <TimeControl 
        currentDate={currentDate} 
        setCurrentDate={setCurrentDate}
        viewRange={viewRange}
        setViewRange={setViewRange}
        globalMin={GLOBAL_MIN}
        globalMax={GLOBAL_MAX}
        events={MOCK_EVENTS}
        setJumpTargetId={setJumpTargetId}
      />
    </div>
  );
}