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
  placeName?: string;
  
  // New Geo-Spatial Dimensions
  granularity: 'spot' | 'city' | 'territory' | 'continent';
  certainty: 'definite' | 'approximate';
  customRadius?: number;
}

// --- Mock Data ---
const MOCK_EVENTS: EventData[] = [
  // --- Ancient Era ---
  { 
    id: '1', 
    title: 'Great Pyramid', 
    start: { year: -2560, precision: 'year' }, 
    lat: 29.9792, 
    lng: 31.1342, 
    summary: 'The Great Pyramid of Giza is completed.', 
    placeName: 'Giza, Egypt',
    granularity: 'spot',
    certainty: 'definite',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg' 
  },
  { id: '2', title: 'Code of Hammurabi', start: { year: -1750, precision: 'year' }, lat: 32.5363, lng: 44.4208, summary: 'Babylonian law code issued.', locationPrecision: 'city', placeName: 'Babylon', granularity: 'city', certainty: 'definite', customRadius: 5000 },
  { id: '3', title: 'Trojan War', start: { year: -1184, precision: 'year' }, lat: 39.9575, lng: 26.2389, summary: 'Legendary conflict in Troy.', locationPrecision: 'city', placeName: 'Troy', granularity: 'city', certainty: 'approximate' },
  { id: '4', title: 'David King of Israel', start: { year: -1000, precision: 'year' }, lat: 31.7683, lng: 35.2137, summary: 'David becomes King of Israel.', locationPrecision: 'city', placeName: 'Jerusalem', granularity: 'city', certainty: 'approximate' },
  { id: '5', title: 'First Olympics', start: { year: -776, precision: 'year' }, lat: 37.6384, lng: 21.6297, summary: 'First recorded Olympic Games.', locationPrecision: 'exact', placeName: 'Olympia, Greece', granularity: 'spot', certainty: 'definite' },
  { id: '6', title: 'Rome Founded', start: { year: -753, precision: 'year' }, lat: 41.8902, lng: 12.4922, summary: 'Legendary founding of Rome.', locationPrecision: 'city', placeName: 'Rome', granularity: 'city', certainty: 'approximate' },
  
  // --- Classical Era ---
  { id: '7', title: 'Alexander\'s Conquests', start: { year: -334, precision: 'year' }, end: { year: -323, precision: 'year' }, lat: 34.0, lng: 44.0, summary: 'Alexander creates a vast empire.', locationPrecision: 'country', placeName: 'Macedon Empire', granularity: 'continent', certainty: 'definite', customRadius: 2000000 },
  { id: '8', title: 'Great Wall of China', start: { year: -221, precision: 'year' }, lat: 40.4319, lng: 116.5704, summary: 'Qin Shi Huang begins unification of the walls.', locationPrecision: 'country', placeName: 'China', granularity: 'territory', certainty: 'definite', customRadius: 800000 },
  { id: '9', title: 'Caesar Assassinated', start: { year: -44, month: 3, day: 15, precision: 'day' }, lat: 41.8955, lng: 12.4736, summary: 'Julius Caesar killed in Senate.', locationPrecision: 'exact', placeName: 'Rome (Theatre of Pompey)', granularity: 'spot', certainty: 'definite', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Retrato_de_Julio_C%C3%A9sar_%2826724083101%29.jpg/367px-Retrato_de_Julio_C%C3%A9sar_%2826724083101%29.jpg' },
  { id: '10', title: 'Augustus Emperor', start: { year: -27, precision: 'year' }, lat: 41.9028, lng: 12.4964, summary: 'Roman Empire begins.', locationPrecision: 'city', placeName: 'Rome', granularity: 'city', certainty: 'definite' },
  { id: '11', title: 'Jesus Birth (Approx)', start: { year: 1, precision: 'year' }, lat: 31.7054, lng: 35.2024, summary: 'Traditional date of birth.', locationPrecision: 'city', placeName: 'Bethlehem', granularity: 'city', certainty: 'approximate' },
  { id: '12', title: 'Vesuvius Erupts', start: { year: 79, month: 8, day: 24, precision: 'day' }, lat: 40.8172, lng: 14.4269, summary: 'Pompeii destroyed.', locationPrecision: 'exact', placeName: 'Pompeii', granularity: 'city', certainty: 'definite', customRadius: 8000 },
  { id: '13', title: 'Trajan\'s Column', start: { year: 113, precision: 'year' }, lat: 41.8958, lng: 12.4843, summary: 'Monument to Dacian Wars.', locationPrecision: 'exact', placeName: 'Rome', granularity: 'spot', certainty: 'definite' },

  // --- Middle Ages ---
  { id: '14', title: 'Fall of Western Rome', start: { year: 476, precision: 'year' }, lat: 44.4248, lng: 12.2035, summary: 'Romulus Augustulus deposed.', locationPrecision: 'city', placeName: 'Ravenna', granularity: 'city', certainty: 'definite' },
  { id: '15', title: 'Hagia Sophia', start: { year: 537, precision: 'year' }, lat: 41.0086, lng: 28.9802, summary: 'Justinian completes the basilica.', locationPrecision: 'exact', placeName: 'Constantinople', granularity: 'spot', certainty: 'definite' },
  { id: '16', title: 'Charlemagne Crowned', start: { year: 800, month: 12, day: 25, precision: 'day' }, lat: 41.9029, lng: 12.4534, summary: 'Holy Roman Emperor.', locationPrecision: 'exact', placeName: 'Rome', granularity: 'spot', certainty: 'definite' },
  { id: '17', title: 'Battle of Hastings', start: { year: 1066, precision: 'year' }, lat: 50.9127, lng: 0.4856, summary: 'Norman conquest of England.', locationPrecision: 'exact', placeName: 'East Sussex, UK', granularity: 'city', certainty: 'definite' },
  { id: '18', title: 'Magna Carta', start: { year: 1215, precision: 'year' }, lat: 51.4446, lng: -0.5606, summary: 'King John signs the charter.', locationPrecision: 'exact', placeName: 'Runnymede', granularity: 'spot', certainty: 'definite' },
  { id: '19', title: 'Black Death', start: { year: 1347, precision: 'year' }, end: { year: 1351, precision: 'year' }, lat: 48.0, lng: 12.0, summary: 'Plague ravages Europe.', locationPrecision: 'country', placeName: 'Europe', granularity: 'continent', certainty: 'definite', customRadius: 1500000 },
  
  // --- Age of Discovery ---
  { id: '20', title: 'Columbus Voyage', start: { year: 1492, month: 10, day: 12, precision: 'day' }, lat: 24.1167, lng: -74.4667, summary: 'Columbus reaches Americas.', locationPrecision: 'exact', placeName: 'Bahamas', granularity: 'city', certainty: 'definite' },
  { id: '21', title: 'Mona Lisa', start: { year: 1503, precision: 'year' }, lat: 43.7696, lng: 11.2558, summary: 'Da Vinci paints masterpiece.', locationPrecision: 'exact', placeName: 'Florence', granularity: 'city', certainty: 'definite' },
  { id: '22', title: 'Martin Luther', start: { year: 1517, precision: 'year' }, lat: 51.8664, lng: 12.6433, summary: '95 Theses reformation.', locationPrecision: 'exact', placeName: 'Wittenberg', granularity: 'city', certainty: 'definite' },
  { id: '23', title: 'Magellan Circumnavigation', start: { year: 1519, precision: 'year' }, end: { year: 1522, precision: 'year' }, lat: 0, lng: -160, summary: 'First voyage around world.', locationPrecision: 'country', placeName: 'The Oceans (Global)', granularity: 'continent', certainty: 'definite', customRadius: 8000000 },
  { id: '24', title: 'Copernicus Death', start: { year: 1543, precision: 'year' }, lat: 54.3520, lng: 18.6466, summary: 'Heliocentric theory published.', locationPrecision: 'city', placeName: 'Frombork, Poland', granularity: 'city', certainty: 'definite' },
  
  // --- Early Modern ---
  { id: '25', title: 'Jamestown', start: { year: 1607, precision: 'year' }, lat: 37.2117, lng: -76.7777, summary: 'English settlement in Virginia.', locationPrecision: 'exact', placeName: 'Virginia', granularity: 'city', certainty: 'definite' },
  { id: '26', title: 'Taj Mahal', start: { year: 1632, precision: 'year' }, lat: 27.1751, lng: 78.0421, summary: 'Mughal masterpiece construction.', locationPrecision: 'exact', placeName: 'Agra, India', granularity: 'spot', certainty: 'definite' },
  { id: '27', title: 'US Independence', start: { year: 1776, month: 7, day: 4, precision: 'day' }, lat: 39.9489, lng: -75.1500, summary: 'Declaration signed.', locationPrecision: 'exact', placeName: 'Philadelphia', granularity: 'city', certainty: 'definite' },
  { id: '28', title: 'French Revolution', start: { year: 1789, month: 7, day: 14, precision: 'day' }, lat: 48.8532, lng: 2.3691, summary: 'Bastille stormed.', locationPrecision: 'exact', placeName: 'Paris', granularity: 'city', certainty: 'definite' },
  
  // --- Modern Era ---
  { id: '29', title: 'Battle of Waterloo', start: { year: 1815, precision: 'year' }, lat: 50.6796, lng: 4.4053, summary: 'Napoleon defeated.', locationPrecision: 'exact', placeName: 'Waterloo, Belgium', granularity: 'city', certainty: 'definite', customRadius: 5000 },
  { id: '30', title: 'Telegraph Invented', start: { year: 1844, precision: 'year' }, lat: 38.8977, lng: -77.0365, summary: 'First message sent.', locationPrecision: 'city', placeName: 'Washington D.C.', granularity: 'city', certainty: 'definite' },
  { id: '31', title: 'US Civil War', start: { year: 1861, precision: 'year' }, end: { year: 1865, precision: 'year' }, lat: 38.0, lng: -78.0, summary: 'North vs South conflict.', locationPrecision: 'country', placeName: 'Eastern United States', granularity: 'territory', certainty: 'definite', customRadius: 600000 },
  { id: '32', title: 'Meiji Restoration', start: { year: 1868, precision: 'year' }, lat: 36.2048, lng: 138.2529, summary: 'Japan modernization.', locationPrecision: 'country', placeName: 'Japan', granularity: 'territory', certainty: 'definite', customRadius: 500000 },
  { id: '33', title: 'Eiffel Tower', start: { year: 1889, precision: 'year' }, lat: 48.8584, lng: 2.2945, summary: 'World Fair landmark.', locationPrecision: 'exact', placeName: 'Paris', granularity: 'spot', certainty: 'definite' },
  { id: '34', title: 'Wright Brothers', start: { year: 1903, precision: 'year' }, lat: 36.0195, lng: -75.6668, summary: 'First powered flight.', locationPrecision: 'exact', placeName: 'Kitty Hawk, NC', granularity: 'spot', certainty: 'definite', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Wright_First_Flight_1903.jpg/640px-Wright_First_Flight_1903.jpg' },
  { id: '35', title: 'Titanic Sinks', start: { year: 1912, precision: 'year' }, lat: 41.7325, lng: -49.9469, summary: 'Luxury liner hits iceberg.', locationPrecision: 'exact', placeName: 'North Atlantic', granularity: 'spot', certainty: 'definite' },
  { id: '36', title: 'World War I', start: { year: 1914, precision: 'year' }, end: { year: 1918, precision: 'year' }, lat: 50.0, lng: 10.0, summary: 'Global conflict focused in Europe.', locationPrecision: 'country', placeName: 'Europe', granularity: 'continent', certainty: 'definite', customRadius: 1200000, imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Soldiers_of_the_Australian_4th_Division_in_the_field_at_Hooge%2C_Belgium%2C_29_October_1917.jpg/640px-Soldiers_of_the_Australian_4th_Division_in_the_field_at_Hooge%2C_Belgium%2C_29_October_1917.jpg' },
  { id: '37', title: 'Penicillin', start: { year: 1928, precision: 'year' }, lat: 51.5166, lng: -0.1765, summary: 'Alexander Fleming discovery.', locationPrecision: 'exact', placeName: 'London', granularity: 'city', certainty: 'definite' },
  { id: '38', title: 'World War II', start: { year: 1939, precision: 'year' }, end: { year: 1945, precision: 'year' }, lat: 52.5200, lng: 13.4050, summary: 'Global war.', locationPrecision: 'country', placeName: 'Europe/Asia', granularity: 'continent', certainty: 'definite', customRadius: 2500000 },
  { id: '39', title: 'Moon Landing', start: { year: 1969, month: 7, day: 20, precision: 'day' }, lat: 28.5721, lng: -80.6480, summary: 'Apollo 11 mission launch site.', locationPrecision: 'exact', placeName: 'Kennedy Space Center', granularity: 'spot', certainty: 'definite', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Aldrin_Apollo_11_original.jpg/600px-Aldrin_Apollo_11_original.jpg' },
  { id: '40', title: 'Berlin Wall Falls', start: { year: 1989, precision: 'year' }, lat: 52.5163, lng: 13.3777, summary: 'End of Cold War symbol.', locationPrecision: 'exact', placeName: 'Berlin', granularity: 'city', certainty: 'definite', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Berlinermauer.jpg/640px-Berlinermauer.jpg' },
  { id: '41', title: 'World Wide Web', start: { year: 1991, precision: 'year' }, lat: 46.2299, lng: 6.0533, summary: 'Tim Berners-Lee at CERN.', locationPrecision: 'exact', placeName: 'Geneva, Switzerland', granularity: 'spot', certainty: 'definite' }
];

// --- Helper Functions ---

const getMonthName = (month: number) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return months[month - 1] || "";
};

const toSliderValue = (year: number): number => {
  return year > 0 ? year - 1 : year;
};

const fromSliderValue = (value: number): { year: number, era: 'BC' | 'AD' } => {
  const floored = Math.floor(value);
  if (floored >= 0) {
    return { year: floored + 1, era: 'AD' };
  } else {
    return { year: Math.abs(floored), era: 'BC' };
  }
};

const formatNaturalDate = (sliderValue: number, sliderSpan: number): string => {
  const { year, era } = fromSliderValue(sliderValue);
  const fraction = sliderValue - Math.floor(sliderValue);
  const dayOfYear = Math.floor(fraction * 365.25);
  const date = new Date(2000, 0); 
  date.setDate(dayOfYear + 1); 
  
  const month = date.getMonth() + 1; 
  const day = date.getDate(); 

  const yearStr = `${year} ${era}`;

  if (sliderSpan > 1000) {
    return yearStr;
  } else if (sliderSpan > 20) {
    return `${getMonthName(month)} ${yearStr}`;
  } else {
    return `${getMonthName(month)} ${day}, ${yearStr}`;
  }
};

const formatChronosTime = (time: ChronosTime): string => {
  const yearStr = time.year < 0 ? `${Math.abs(time.year)} BC` : `${time.year} AD`;
  if (time.precision === 'day' && time.month && time.day) {
    return `${getMonthName(time.month)} ${time.day}, ${yearStr}`;
  }
  return yearStr;
};

const formatSliderTick = (value: number): string => {
  const { year, era } = fromSliderValue(value);
  return `${year} ${era}`;
};

const formatEventDateRange = (event: EventData): string => {
  const startStr = formatChronosTime(event.start);
  if (event.end) {
    const endStr = formatChronosTime(event.end);
    return `${startStr} – ${endStr}`;
  }
  return startStr;
};

const formatCoordinates = (lat: number, lng: number): string => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const latDeg = Math.floor(Math.abs(lat));
    const latMin = Math.floor((Math.abs(lat) - latDeg) * 60);
    const lngDeg = Math.floor(Math.abs(lng));
    const lngMin = Math.floor((Math.abs(lng) - lngDeg) * 60);
    return `${latDeg}°${latMin}′${latDir}, ${lngDeg}°${lngMin}′${lngDir}`;
};

const getLocationString = (event: EventData): string => {
    if (event.placeName) return event.placeName;
    return formatCoordinates(event.lat, event.lng);
};

// --- Leaflet Map Component ---
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
  const shapesMapRef = useRef<Map<string, any>>(new Map());

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
           attributionControl: false,
           zoomSnap: 0, 
           zoomDelta: 0.1, // Set for smooth zoom
           wheelPxPerZoomLevel: 10 // High sensitivity
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

  // Update Logic
  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    const markersMap = markersMapRef.current;
    const shapesMap = shapesMapRef.current;

    events.forEach(event => {
      let isActive = false;
      const startVal = toSliderValue(event.start.year);
      const endVal = event.end ? toSliderValue(event.end.year) : null;

      if (jumpTargetId) {
        if (jumpTargetId === "___ANIMATING___") {
            isActive = false;
        } else {
            isActive = event.id === jumpTargetId;
        }
      } else {
        if (endVal !== null) {
          isActive = currentDate >= startVal && currentDate <= endVal;
        } else {
          isActive = Math.abs(currentDate - startVal) <= dynamicThreshold;
        }
      }

      // RENDER MARKERS
      if (isActive) {
        if (!markersMap.has(event.id)) {
          // MARKER CONTENT
          const htmlContent = `
            <div class="event-card-container" style="
                transform: translate(-50%, calc(-100% + 4px)); 
                display: flex;
                flex-direction: column;
                align-items: center;
                pointer-events: none; 
            ">
                <div class="card" style="
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    width: 240px;
                    overflow: hidden;
                    font-family: system-ui;
                    pointer-events: auto; 
                    transition: transform 0.2s;
                ">
                    ${event.imageUrl ? `<div style="height: 100px; width: 100%; background-image: url('${event.imageUrl}'); background-size: cover; background-position: center;"></div>` : ''}
                    <div style="padding: 10px 12px;">
                        <div style="font-size: 14px; font-weight: 700; color: #111; margin-bottom: 4px; line-height: 1.2;">${event.title}</div>
                        
                        <div style="display: flex; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                            <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                            <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                ${getLocationString(event)}
                            </span>
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
             el.style.transition = 'none'; // Instant appear
          }
          markersMap.set(event.id, marker);
        } else {
          const marker = markersMap.get(event.id);
          const el = marker.getElement();
          if (el) {
             el.style.transition = 'none'; // Instant
             el.style.opacity = '1';
             el.style.pointerEvents = 'auto'; 
             marker.setZIndexOffset(1000);
          }
        }

        // 2. RENDER AREA SHAPE (Circle)
        if (event.granularity !== 'spot') {
            if (!shapesMap.has(event.id)) {
                let radius = 10000; 
                if (event.customRadius) radius = event.customRadius;
                else if (event.granularity === 'city') radius = 10000;
                else if (event.granularity === 'territory') radius = 500000;
                else if (event.granularity === 'continent') radius = 1500000;

                const color = '#3b82f6'; 
                const dashArray = event.certainty === 'approximate' ? '5, 10' : null;
                const opacity = event.certainty === 'approximate' ? 0.4 : 0.6;

                const circle = L.circle([event.lat, event.lng], {
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.1,
                    radius: radius,
                    dashArray: dashArray,
                    weight: 2,
                    opacity: opacity
                }).addTo(map);
                
                circle.bringToBack();
                shapesMap.set(event.id, circle);
            }
        }
      } else {
        // HIDE
        if (markersMap.has(event.id)) {
          const marker = markersMap.get(event.id);
          const el = marker.getElement();
          if (el) {
             el.style.transition = 'opacity 2s ease-out'; // Slow Fade
             el.style.opacity = '0';
             el.style.pointerEvents = 'none'; 
             marker.setZIndexOffset(0);
          }
        }
        if (shapesMap.has(event.id)) {
            const shape = shapesMap.get(event.id);
            shape.remove(); 
            shapesMap.delete(event.id);
        }
      }
    });
  }, [currentDate, events, dynamicThreshold, jumpTargetId]); 

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};

// --- Component: Overview Timeline ---
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

        const handleMouseUp = () => {
            setIsDragging(false);
        };

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
            <div 
                ref={containerRef}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-slate-100 rounded-full overflow-hidden"
            >
                {events.map(event => {
                    const sliderVal = toSliderValue(event.start.year);
                    const percent = ((sliderVal - globalMin) / totalSpan) * 100;
                    return (
                        <div 
                            key={event.id}
                            className="absolute top-0 bottom-0 w-px bg-slate-300"
                            style={{ left: `${percent}%` }}
                        />
                    )
                })}
            </div>

            {!isFullyZoomedOut && (
                <div 
                    className="absolute top-1/2 -translate-y-1/2 h-5 bg-blue-500/10 border-2 border-blue-500 rounded-md cursor-grab active:cursor-grabbing hover:bg-blue-500/20 transition-colors z-10 box-border flex items-center justify-between px-1"
                    style={{ 
                        left: `${viewStartPercent}%`, 
                        width: `${viewWidthPercent}%`,
                        minWidth: '20px'
                    }}
                    onMouseDown={handleMouseDown}
                >
                    <ChevronLeft size={10} strokeWidth={3} className="text-blue-500" />
                    <ChevronRight size={10} strokeWidth={3} className="text-blue-500" />
                </div>
            )}
            
            <div className="absolute -bottom-2 left-0 text-[10px] text-slate-400 font-mono">
                {formatSliderTick(globalMin)}
            </div>
            <div className="absolute -bottom-2 right-0 text-[10px] text-slate-400 font-mono">
                {formatSliderTick(globalMax)}
            </div>
        </div>
    );
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
    const clickX = e.clientX - rect.left;
    const percent = Math.min(Math.max(clickX / rect.width, 0), 1);
    const span = viewRange.max - viewRange.min;
    const targetDate = viewRange.min + (span * percent);

    smoothJump(targetDate, null);
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    e.preventDefault(); 
    setIsThumbDragging(true);
    
    if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
        setJumpTargetId(null);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isThumbDragging || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = Math.min(Math.max(clickX / rect.width, 0), 1);
      const span = viewRange.max - viewRange.min;
      const newValue = viewRange.min + (span * percent);
      
      setCurrentDate(newValue);
    };

    const handleMouseUp = () => {
      setIsThumbDragging(false);
    };

    if (isThumbDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isThumbDragging, viewRange, setCurrentDate]);

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
        ticks.push({ value: t, left: percent });
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
                    ${isHovered 
                        ? 'bg-blue-600 scale-125 shadow-sm border border-white z-30' 
                        : 'bg-slate-700/80 hover:bg-blue-500'
                    }`}
                style={{ left: `${percent}%` }}
                onMouseEnter={() => setHoveredEventId(event.id)}
                onMouseLeave={() => setHoveredEventId(null)}
                onClick={(e) => {
                    e.stopPropagation(); 
                    smoothJump(sliderVal, event.id); 
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
        
        {/* Header */}
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

        {/* Slider Container */}
        <div className="px-4">
            <div className="flex items-center gap-4 relative">
                <button onClick={() => handlePan('left')} className="text-slate-400 hover:text-slate-600">
                    <ChevronLeft size={24} />
                </button>

                <div 
                    ref={trackRef}
                    className="relative flex-grow h-12 flex items-center group cursor-pointer"
                    onMouseDown={handleTrackMouseDown}
                >
                    <div className="absolute top-8 w-full h-4">
                        {generateTicks().map((tick) => (
                            <div 
                                key={tick.value} 
                                className="absolute top-0 w-px h-2 bg-slate-300 flex flex-col items-center"
                                style={{ left: `${tick.left}%` }}
                            >
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

                    <div 
                        className={`absolute top-1/2 w-6 h-6 bg-blue-600 rounded-full shadow-lg border-2 border-white z-40 transform -translate-y-1/2 -translate-x-1/2 
                            ${isThumbDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'} 
                            transition-transform duration-75 
                            ${isThumbVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        style={{ left: `${Math.max(0, Math.min(100, thumbPercent))}%` }}
                        onMouseDown={handleThumbMouseDown}
                    />
                    
                    <input
                        type="range"
                        min={viewRange.min}
                        max={viewRange.max}
                        step="any"
                        value={currentDate}
                        readOnly
                        className="w-full h-2 bg-transparent appearance-none cursor-pointer z-10 absolute opacity-0 pointer-events-none"
                    />
                </div>

                <button onClick={() => handlePan('right')} className="text-slate-400 hover:text-slate-600">
                    <ChevronRight size={24} />
                </button>
            </div>

            <OverviewTimeline 
                viewRange={viewRange}
                setViewRange={setViewRange}
                globalMin={globalMin}
                globalMax={globalMax}
                events={events}
            />
        </div>

      </div>
    </div>
  );
};

// --- Main Page Component ---
const Page = () => {
  const GLOBAL_MIN = -3000;
  const GLOBAL_MAX = 2023; 

  const [currentDate, setCurrentDate] = useState(0); 
  const [viewRange, setViewRange] = useState({ min: GLOBAL_MIN, max: GLOBAL_MAX });
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);

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
          events={MOCK_EVENTS} 
          viewRange={viewRange}
          jumpTargetId={jumpTargetId}
        />
      </main>

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
};

export default Page;