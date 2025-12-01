"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Map as MapIcon, Layers, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

// --- Types ---

interface ChronosTime {
  year: number;
  month?: number;
  day?: number;
  precision: 'year' | 'month' | 'day'; 
}

interface ChronosLocation {
  lat: number;
  lng: number;
  placeName?: string; 
  granularity: 'spot' | 'city' | 'territory' | 'continent';
  certainty: 'definite' | 'approximate';
  customRadius?: number; 
  regionId?: string; 
}

interface EventData {
  id: string;
  title: string;
  summary: string;
  imageUrl?: string;
  start: ChronosTime;
  end?: ChronosTime;
  location: ChronosLocation;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// --- 2. Predefined Region Shapes ---
const PREDEFINED_REGIONS: Record<string, [number, number][]> = {
  'egypt': [[31.5, 25.0], [31.5, 34.0], [22.0, 34.0], [22.0, 25.0]],
  'italy': [[46.5, 12.0], [45.0, 13.0], [44.0, 12.5], [42.0, 14.0], [40.0, 18.0], [38.0, 16.0], [38.0, 15.5], [40.0, 15.0], [42.0, 12.0], [44.0, 10.0], [44.5, 7.0], [46.0, 7.0]],
  'europe': [[36.0, -10.0], [55.0, -10.0], [60.0, 5.0], [60.0, 30.0], [45.0, 40.0], [35.0, 25.0], [36.0, -5.0]],
  'china_heartland': [[40.0, 110.0], [40.0, 120.0], [30.0, 122.0], [22.0, 115.0], [25.0, 100.0], [35.0, 100.0]],
  'usa_east': [[45.0, -85.0], [45.0, -70.0], [30.0, -80.0], [30.0, -90.0]],
  'babylon_region': [[34.0, 42.0], [34.0, 46.0], [30.0, 48.0], [30.0, 44.0]]
};

// --- 1. Mock Data ---
const MOCK_EVENTS: EventData[] = [
  { id: '1', title: 'Great Pyramid', start: { year: -2560, precision: 'year' }, location: { lat: 29.9792, lng: 31.1342, placeName: 'Giza, Egypt', granularity: 'spot', certainty: 'definite', regionId: 'egypt' }, summary: 'The Great Pyramid of Giza is completed.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg' },
  { id: '2', title: 'Code of Hammurabi', start: { year: -1750, precision: 'year' }, location: { lat: 32.5363, lng: 44.4208, placeName: 'Babylon', granularity: 'city', certainty: 'definite', customRadius: 5000, regionId: 'babylon_region' }, summary: 'Babylonian law code issued.' },
  { id: '5', title: 'First Olympics', start: { year: -776, precision: 'year' }, location: { lat: 37.6384, lng: 21.6297, placeName: 'Olympia', granularity: 'spot', certainty: 'definite' }, summary: 'First recorded Olympic Games.' },
  { id: '6', title: 'Rome Founded', start: { year: -753, precision: 'year' }, location: { lat: 41.8902, lng: 12.4922, placeName: 'Rome', granularity: 'city', certainty: 'approximate', regionId: 'italy' }, summary: 'Legendary founding of Rome.' },
  { id: 'dummy-1', title: 'Event West of Paris', start: { year: 2024, precision: 'year' }, location: { lat: 48.8566, lng: 2.2500, placeName: 'Paris West', granularity: 'spot', certainty: 'definite' }, summary: 'Test West.' },
  { id: 'dummy-2', title: 'Event East of Paris', start: { year: 2024, precision: 'year' }, location: { lat: 48.8566, lng: 2.4500, placeName: 'Paris East', granularity: 'spot', certainty: 'definite' }, summary: 'Test East.' },
  { id: 'dummy-3', title: 'Event Central Paris', start: { year: 2024, precision: 'year' }, location: { lat: 48.8600, lng: 2.3500, placeName: 'Paris Center', granularity: 'spot', certainty: 'definite' }, summary: 'Test Center.' },
  { id: '7', title: 'Alexander\'s Conquests', start: { year: -334, precision: 'year' }, end: { year: -323, precision: 'year' }, location: { lat: 34.0, lng: 44.0, placeName: 'Macedon Empire', granularity: 'continent', certainty: 'definite', customRadius: 2000000 }, summary: 'Alexander creates a vast empire.' },
  { id: '8', title: 'Great Wall of China', start: { year: -221, precision: 'year' }, location: { lat: 40.4319, lng: 116.5704, placeName: 'China', granularity: 'territory', certainty: 'definite', regionId: 'china_heartland' }, summary: 'Qin Shi Huang begins unification of the walls.' },
  { id: '20', title: 'Columbus Voyage', start: { year: 1492, month: 10, day: 12, precision: 'day' }, location: { lat: 24.1167, lng: -74.4667, placeName: 'Bahamas', granularity: 'city', certainty: 'definite' }, summary: 'Columbus reaches Americas.' },
  { id: '32', title: 'Meiji Restoration', start: { year: 1868, precision: 'year' }, location: { lat: 36.2048, lng: 138.2529, placeName: 'Japan', granularity: 'territory', certainty: 'definite', customRadius: 500000 }, summary: 'Japan modernization.' },
  { id: '36', title: 'World War I', start: { year: 1914, precision: 'year' }, end: { year: 1918, precision: 'year' }, location: { lat: 50.0, lng: 10.0, placeName: 'Europe', granularity: 'continent', certainty: 'definite', regionId: 'europe' }, summary: 'Global conflict.' }
];

// --- Helper Functions ---
const getMonthName = (month: number) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1] || "";
const toSliderValue = (year: number) => year > 0 ? year - 1 : year;
const fromSliderValue = (value: number) => { const floored = Math.floor(value); return floored >= 0 ? { year: floored + 1, era: 'AD' } : { year: Math.abs(floored), era: 'BC' }; };
const formatChronosTime = (time: ChronosTime) => time.year < 0 ? `${Math.abs(time.year)} BC` : `${time.year} AD`;
const formatSliderTick = (value: number) => { const { year, era } = fromSliderValue(value); return `${year} ${era}`; };
const formatEventDateRange = (event: EventData) => event.end ? `${formatChronosTime(event.start)} – ${formatChronosTime(event.end)}` : formatChronosTime(event.start);
const formatNaturalDate = (sliderValue: number, sliderSpan: number) => {
  const { year, era } = fromSliderValue(sliderValue);
  return sliderSpan > 1000 ? `${year} ${era}` : `${year} ${era}`;
};
const getLocationString = (event: EventData) => event.location.placeName || `${event.location.lat.toFixed(2)}, ${event.location.lng.toFixed(2)}`;

const formatCoordinates = (lat: number, lng: number): string => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const latDeg = Math.floor(Math.abs(lat));
    const latMin = Math.floor((Math.abs(lat) - latDeg) * 60);
    const lngDeg = Math.floor(Math.abs(lng));
    const lngMin = Math.floor((Math.abs(lng) - lngDeg) * 60);
    return `${latDeg}°${latMin}′${latDir}, ${lngDeg}°${lngMin}′${lngDir}`;
};

// --- 1. Component: Leaflet Map (Smart Layout) ---
const LeafletMap = ({ 
  currentDate, 
  events, 
  viewRange,
  jumpTargetId,
  onBoundsChange
}: { 
  currentDate: number, 
  events: EventData[], 
  viewRange: { min: number, max: number },
  jumpTargetId: string | null,
  onBoundsChange: (bounds: MapBounds) => void
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersMapRef = useRef<Map<string, { card: any, line: any, shape?: any }>>(new Map());
  const shapesMapRef = useRef<Map<string, any>>(new Map());
  const [mapZoom, setMapZoom] = useState(2);

  const dynamicThreshold = Math.max(0.5, (viewRange.max - viewRange.min) / 100);

  // Init Map
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
           zoomControl: false, attributionControl: false, zoomSnap: 0, zoomDelta: 0.5, wheelPxPerZoomLevel: 10 
        }).setView([48.8566, 2.3522], 11); 
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);
        
        map.createPane('shapesPane').style.zIndex = '450'; 
        map.createPane('linesPane').style.zIndex = '550'; 
        map.createPane('cardsPane').style.zIndex = '700'; 

        const updateBounds = () => {
            const bounds = map.getBounds();
            onBoundsChange({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
            });
        };

        map.on('zoomend', () => {
            setMapZoom(map.getZoom());
            updateBounds();
        });
        map.on('moveend', updateBounds);
        
        // Initial bounds report
        updateBounds();

        mapInstanceRef.current = map;
      }
    }
    return () => {};
  }, []);

  // Render & Layout Logic
  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    const layersMap = layersMapRef.current;
    const shapesMap = shapesMapRef.current;

    // A. Filter Active
    const activeEvents = events.filter(event => {
      const startVal = toSliderValue(event.start.year);
      const endVal = event.end ? toSliderValue(event.end.year) : null;
      let isActive = false;
      if (jumpTargetId) {
        isActive = (jumpTargetId === "___ANIMATING___") ? false : event.id === jumpTargetId;
      } else {
        isActive = endVal !== null ? (currentDate >= startVal && currentDate <= endVal) : (Math.abs(currentDate - startVal) <= dynamicThreshold);
      }
      return isActive;
    });

    // B. Smart Layout Algorithm
    const CARD_WIDTH = 250;
    const GAP = 20;
    
    const screenItems = activeEvents.map(e => {
        const pt = map.latLngToLayerPoint([e.location.lat, e.location.lng]);
        return { id: e.id, x: pt.x, y: pt.y, event: e };
    }).sort((a, b) => a.x - b.x);

    const clusters: typeof screenItems[] = [];
    if (screenItems.length > 0) {
        let currentCluster = [screenItems[0]];
        for (let i = 1; i < screenItems.length; i++) {
            const prev = currentCluster[currentCluster.length - 1];
            const curr = screenItems[i];
            if (Math.abs(curr.x - prev.x) < (CARD_WIDTH + GAP)) {
                currentCluster.push(curr);
            } else {
                clusters.push(currentCluster);
                currentCluster = [curr];
            }
        }
        clusters.push(currentCluster);
    }

    const layoutMap = new Map<string, { offsetX: number, offsetY: number }>();
    clusters.forEach(cluster => {
        if (cluster.length === 1) {
            layoutMap.set(cluster[0].id, { offsetX: 0, offsetY: 0 });
        } else {
            const totalAnchorX = cluster.reduce((sum, item) => sum + item.x, 0);
            const averageAnchorX = totalAnchorX / cluster.length;
            const totalSpreadWidth = cluster.length * CARD_WIDTH + (cluster.length - 1) * GAP;
            const startScreenX = averageAnchorX - (totalSpreadWidth / 2) + (CARD_WIDTH / 2);

            cluster.forEach((item, idx) => {
                const targetScreenX = startScreenX + idx * (CARD_WIDTH + GAP);
                const offsetX = targetScreenX - item.x;
                const midIdx = (cluster.length - 1) / 2;
                const dist = Math.abs(idx - midIdx);
                const offsetY = -dist * 25; 
                layoutMap.set(item.id, { offsetX, offsetY });
            });
        }
    });

    // C. Render Updates
    // Cleanup
    events.forEach(e => {
        if (!activeEvents.find(ae => ae.id === e.id) && layersMap.has(e.id)) {
             const layerGroup = layersMap.get(e.id)!;
             const cardEl = layerGroup.card.getElement();
             if (cardEl) {
                 cardEl.style.transition = 'opacity 2s ease-out'; 
                 cardEl.style.opacity = '0';
                 cardEl.style.pointerEvents = 'none'; 
                 layerGroup.card.setZIndexOffset(0);
             }
             const lineEl = layerGroup.line.getElement();
             if (lineEl) {
                lineEl.style.transition = 'opacity 2s ease-out'; 
                lineEl.style.opacity = '0';
             }
             if(layerGroup.shape) layerGroup.shape.remove();
        }
    });

    // Draw Active
    activeEvents.forEach(event => {
        const layout = layoutMap.get(event.id) || { offsetX: 0, offsetY: 0 };
        const { offsetX, offsetY } = layout;
        
        const BASE_LIFT = -15; 
        const finalY = offsetY + BASE_LIFT;
        const finalX = offsetX;

        // Dynamic Height Calculation
        const CARD_HEIGHT = event.imageUrl ? 220 : 120; 
        // Line Target: Center of the card
        const lineTargetY = finalY - (CARD_HEIGHT / 2);

        const lineLen = Math.sqrt(finalX * finalX + lineTargetY * lineTargetY);
        const lineAngle = Math.atan2(lineTargetY, finalX) * (180 / Math.PI);

        if (!layersMap.has(event.id)) {
            // 1. LINE MARKER
            const lineHtml = `
               <div style="position: relative; width: 0; height: 0;">
                  <div style="position: absolute; top: 0; left: 0; width: 12px; height: 12px; background: #2563eb; border: 2px solid white; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 10;"></div>
                  <div style="position: absolute; top: 0; left: 0; width: ${lineLen}px; height: 2px; background: #2563eb; transform-origin: 0 50%; transform: rotate(${lineAngle}deg); z-index: -1;"></div>
               </div>
            `;
            const lineIcon = L.divIcon({ className: '', html: lineHtml, iconSize: [0,0] });
            const lineMarker = L.marker([event.location.lat, event.location.lng], { icon: lineIcon, pane: 'linesPane' }).addTo(map);

            // 2. CARD MARKER
            const cardHtml = `
               <div class="card-wrapper" style="
                   position: absolute; left: 0; top: 0; 
                   transform: translate(-50%, -100%) translate(${finalX}px, ${finalY}px); 
                   width: 240px; 
                   transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
               ">
                  <div style="background: white; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.2); overflow: hidden; font-family: system-ui;">
                      ${event.imageUrl ? `<div style="height: 120px; width: 100%; background-image: url('${event.imageUrl}'); background-size: cover; background-position: center;"></div>` : ''}
                      <div style="padding: 12px;">
                          <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">${event.title}</div>
                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                              <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                              <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">${getLocationString(event)}</span>
                          </div>
                          <div style="font-size: 11px; color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 32px;">${event.summary}</div>
                      </div>
                  </div>
               </div>
            `;
            const cardIcon = L.divIcon({ className: '', html: cardHtml, iconSize: [0,0] });
            const cardMarker = L.marker([event.location.lat, event.location.lng], { icon: cardIcon, pane: 'cardsPane' }).addTo(map);

            // 3. SHAPE
            let shape;
            if (event.location.granularity !== 'spot') {
                 if (event.location.regionId && PREDEFINED_REGIONS[event.location.regionId]) {
                    const latLngs = PREDEFINED_REGIONS[event.location.regionId];
                    const polygon = L.polygon(latLngs, { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 2, opacity: 0.6 }).addTo(map);
                    polygon.bringToBack();
                    shape = polygon;
                 } else {
                     const circle = L.circle([event.location.lat, event.location.lng], { color: '#3b82f6', radius: event.location.customRadius || 10000, fillOpacity: 0.1 }).addTo(map);
                     circle.bringToBack();
                     shape = circle;
                 }
            }

            layersMap.set(event.id, { card: cardMarker, line: lineMarker, shape });
        } else {
            // UPDATE EXISTING
            const { card, line, shape } = layersMap.get(event.id)!;
            
            const cardHtml = `
               <div style="
                   position: absolute; left: 0; top: 0; 
                   transform: translate(-50%, -100%) translate(${finalX}px, ${finalY}px); 
                   width: 240px; 
                   transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
               ">
                  <div style="background: white; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.2); overflow: hidden; font-family: system-ui;">
                      ${event.imageUrl ? `<div style="height: 120px; width: 100%; background-image: url('${event.imageUrl}'); background-size: cover; background-position: center;"></div>` : ''}
                      <div style="padding: 12px;">
                          <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">${event.title}</div>
                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                              <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                              <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">${getLocationString(event)}</span>
                          </div>
                          <div style="font-size: 11px; color: #666; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 32px;">${event.summary}</div>
                      </div>
                  </div>
               </div>
            `;
            card.setIcon(L.divIcon({ className: '', html: cardHtml, iconSize: [0,0] }));

            const lineHtml = `
               <div style="position: relative; width: 0; height: 0;">
                  <div style="position: absolute; top: 0; left: 0; width: 12px; height: 12px; background: #2563eb; border: 2px solid white; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
                  <div style="position: absolute; top: 0; left: 0; width: ${lineLen}px; height: 2px; background: #2563eb; transform-origin: 0 50%; transform: rotate(${lineAngle}deg); opacity: 0.6;"></div>
               </div>
            `;
            line.setIcon(L.divIcon({ className: '', html: lineHtml, iconSize: [0,0] }));

            const cardEl = card.getElement();
            if (cardEl) {
                cardEl.style.transition = 'none'; 
                cardEl.style.opacity = '1';
                cardEl.style.pointerEvents = 'auto'; 
                card.setZIndexOffset(1000);
            }
            const lineEl = line.getElement();
            if (lineEl) {
                lineEl.style.transition = 'none';
                lineEl.style.opacity = '1';
            }
            
             // Ensure shape is visible if it exists
            if (shape) {
                // Shapes don't use opacity CSS transition usually, but just ensuring it's added back if we removed it
                // Leaflet handles shape addition/removal via .addTo() / .remove()
                if (!map.hasLayer(shape)) {
                    shape.addTo(map);
                }
            }
        }
    });

  }, [currentDate, events, dynamicThreshold, jumpTargetId, mapZoom]);

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};

// --- 2. Component: Overview Timeline ---
const OverviewTimeline = ({
    viewRange,
    setViewRange,
    globalMin,
    globalMax,
    events
}: {
    viewRange: { min: number, max: number },
    setViewRange: (range: { min: number, max: number }) => void,
    globalMin: number,
    globalMax: number,
    events: EventData[]
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartMin, setDragStartMin] = useState(0);

    const totalSpan = globalMax - globalMin;
    const viewStartPercent = ((viewRange.min - globalMin) / totalSpan) * 100;
    const viewWidthPercent = ((viewRange.max - viewRange.min) / totalSpan) * 100;
    const isFullyZoomedOut = viewWidthPercent > 99;

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStartX(e.clientX);
        setDragStartMin(viewRange.min);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const deltaX = e.clientX - dragStartX;
            const yearsPerPixel = totalSpan / rect.width;
            const deltaYears = deltaX * yearsPerPixel;

            const currentSpan = viewRange.max - viewRange.min;
            let newMin = dragStartMin + deltaYears;
            
            if (newMin < globalMin) newMin = globalMin;
            if (newMin + currentSpan > globalMax) newMin = globalMax - currentSpan;

            setViewRange({ min: newMin, max: newMin + currentSpan });
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartX, dragStartMin, globalMin, globalMax, viewRange, setViewRange, totalSpan]);

    return (
        <div className="w-full h-8 mt-4 relative select-none">
            <div ref={containerRef} className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-100 rounded-full overflow-hidden">
                {events.map(event => {
                    const sliderVal = toSliderValue(event.start.year);
                    const percent = ((sliderVal - globalMin) / totalSpan) * 100;
                    return <div key={event.id} className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: `${percent}%` }} />
                })}
            </div>
            {!isFullyZoomedOut && (
                <div 
                    className="absolute top-1/2 -translate-y-1/2 h-5 bg-blue-500/10 border-2 border-blue-500 rounded-md cursor-grab active:cursor-grabbing hover:bg-blue-500/20 transition-colors z-10 box-border flex items-center justify-between px-1"
                    style={{ left: `${viewStartPercent}%`, width: `${viewWidthPercent}%`, minWidth: '20px' }}
                    onMouseDown={handleMouseDown}
                >
                    <ChevronLeft size={10} strokeWidth={3} className="text-blue-500" />
                    <ChevronRight size={10} strokeWidth={3} className="text-blue-500" />
                </div>
            )}
            <div className="absolute -bottom-2 left-0 text-[10px] text-slate-400 font-mono">{formatSliderTick(globalMin)}</div>
            <div className="absolute -bottom-2 right-0 text-[10px] text-slate-400 font-mono">{formatSliderTick(globalMax)}</div>
        </div>
    );
};

// --- 3. Component: TimeControl ---
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [isThumbDragging, setIsThumbDragging] = useState(false);

  const smoothJump = (targetDate: number, eventId: string | null) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setJumpTargetId(eventId || "___ANIMATING___");
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
        setJumpTargetId(null);
      }
    };
    animationRef.current = requestAnimationFrame(animate);
  };

  const handleTrackMouseDown = (e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const span = viewRange.max - viewRange.min;
    smoothJump(viewRange.min + (span * percent), null);
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault(); setIsThumbDragging(true);
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; setJumpTargetId(null); }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isThumbDragging || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      const span = viewRange.max - viewRange.min;
      setCurrentDate(viewRange.min + (span * percent));
    };
    const handleMouseUp = () => setIsThumbDragging(false);
    if (isThumbDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isThumbDragging, viewRange, setCurrentDate]);

  const handleZoom = (factor: number) => {
    const span = viewRange.max - viewRange.min;
    const newSpan = span / factor;
    if (factor > 1 && newSpan < 10) return;
    if (factor < 1 && newSpan > (globalMax - globalMin)) { setViewRange({ min: globalMin, max: globalMax }); return; }
    const newMin = Math.max(globalMin, currentDate - newSpan / 2);
    const newMax = Math.min(globalMax, newMin + newSpan);
    setViewRange({ min: Math.max(globalMin, newMax - newSpan), max: newMax });
  };

  const resetZoom = () => setViewRange({ min: globalMin, max: globalMax });

  const generateTicks = () => {
    const span = viewRange.max - viewRange.min;
    let step = 1;
    if (span > 1000) step = 1000; else if (span > 500) step = 500; else if (span > 100) step = 100; else if (span > 50) step = 50; else if (span > 10) step = 10;
    const ticks = [];
    const startTick = Math.ceil(viewRange.min / step) * step;
    for (let t = startTick; t <= viewRange.max; t += step) {
        ticks.push({ value: t, left: ((t - viewRange.min) / span) * 100 });
    }
    return ticks;
  };

  const thumbPercent = ((currentDate - viewRange.min) / (viewRange.max - viewRange.min)) * 100;
  const isThumbVisible = currentDate >= viewRange.min && currentDate <= viewRange.max;

  const renderEventMarkers = () => {
    const span = viewRange.max - viewRange.min;
    
    return events.map(event => {
        const sliderVal = toSliderValue(event.start.year);
        
        if (sliderVal < viewRange.min || sliderVal > viewRange.max) return null;
        
        const percent = ((sliderVal - viewRange.min) / span) * 100;
        const isHovered = hoveredEventId === event.id;
        const isObscuredByThumb = Math.abs(percent - thumbPercent) < 1.5;

        return (
            <div 
                key={event.id}
                className={`group absolute top-1/2 -translate-y-1/2 w-1.5 h-3 cursor-pointer rounded-[1px] z-20 pointer-events-auto transition-none
                    ${isObscuredByThumb ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                    ${isHovered ? 'bg-blue-600 scale-125 shadow-sm border border-white z-30' : 'bg-slate-700/80 hover:bg-blue-500'}`}
                style={{ left: `${percent}%` }}
                // Added animate-in class for new markers
                onMouseEnter={() => setHoveredEventId(event.id)}
                onMouseLeave={() => setHoveredEventId(null)}
                onClick={(e) => { e.stopPropagation(); smoothJump(sliderVal, event.id); }}>
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
        <div className="flex justify-between items-end mb-4">
            <div className="flex gap-2">
                <button onClick={resetZoom} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors" title="Reset View"><Maximize size={18} /></button>
            </div>
            <div className="flex flex-col items-center">
                <div className="text-4xl font-black text-slate-800 tracking-tight flex items-baseline gap-2 font-mono">{formatNaturalDate(currentDate, viewRange.max - viewRange.min)}</div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => handleZoom(0.5)} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm" title="Zoom Out"><ZoomOut size={20} /></button>
                <button onClick={() => handleZoom(2)} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-all shadow-sm" title="Zoom In"><ZoomIn size={20} /></button>
            </div>
        </div>

        <div className="px-4">
            <div className="flex items-center gap-4 relative">
                <div ref={trackRef} className="relative flex-grow h-12 flex items-center group cursor-pointer" onMouseDown={handleTrackMouseDown}>
                    <div className="absolute top-8 w-full h-4">
                        {generateTicks().map((tick) => (
                            <div key={tick.value} className="absolute top-0 w-px h-2 bg-slate-300 flex flex-col items-center" style={{ left: `${tick.left}%` }}>
                                <span className="text-[10px] text-slate-400 mt-2 font-mono whitespace-nowrap">{formatSliderTick(tick.value)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="absolute w-full h-2 bg-slate-100 rounded-full overflow-hidden z-0">
                        <div className="w-full h-full bg-gradient-to-r from-slate-200 via-blue-200 to-slate-200 opacity-50"></div>
                    </div>
                    <div className="absolute w-full h-full pointer-events-none">
                        {renderEventMarkers()}
                    </div>
                    <div className={`absolute top-1/2 w-6 h-6 bg-blue-600 rounded-full shadow-lg border-2 border-white z-40 transform -translate-y-1/2 -translate-x-1/2 ${isThumbDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'} transition-transform duration-75 ${isThumbVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} style={{ left: `${Math.max(0, Math.min(100, thumbPercent))}%` }} onMouseDown={handleThumbMouseDown} />
                </div>
            </div>
            <OverviewTimeline viewRange={viewRange} setViewRange={setViewRange} globalMin={globalMin} globalMax={globalMax} events={events} />
        </div>
      </div>
    </div>
  );
};

// --- 4. Main Page Component ---
export default function ChronoMapPage() {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2024; 

  const [currentDate, setCurrentDate] = useState(2024); 
  const [viewRange, setViewRange] = useState({ min: GLOBAL_MIN, max: GLOBAL_MAX });
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  
  // Map Boundary State
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);

  // Spatial Filter
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
        />
      </main>

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