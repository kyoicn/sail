import React, { useState, useEffect, useRef } from 'react';
import { EventData, MapBounds } from '../../types';
import { PREDEFINED_REGIONS } from '../../lib/constants';
import { calculateSmartLayout } from '../../lib/layout-engine';
import { toSliderValue, formatEventDateRange } from '../../lib/time-engine';
import { getLocationString } from '../../lib/utils';

declare const L: any;

interface LeafletMapProps {
  currentDate: number;
  events: EventData[];
  viewRange: { min: number, max: number };
  jumpTargetId: string | null;
  onBoundsChange: (bounds: MapBounds) => void;
  initialCenter: { lat: number, lng: number };
  initialZoom: number;
  onViewportChange: (center: { lat: number, lng: number }, zoom: number) => void;
  onEventSelect: (event: EventData) => void;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({ 
  currentDate, 
  events, 
  viewRange,
  jumpTargetId,
  onBoundsChange,
  initialCenter,
  initialZoom,
  onViewportChange,
  onEventSelect
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersMapRef = useRef<Map<string, { card: any, line: any, shape?: any }>>(new Map());
  const [mapZoom, setMapZoom] = useState(initialZoom);

  const dynamicThreshold = Math.max(0.5, (viewRange.max - viewRange.min) / 100);

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    
    const initMap = () => {
      if (mapRef.current && !mapInstanceRef.current && (window as any).L) {
        const L = (window as any).L;
        
        const map = L.map(mapRef.current, {
           zoomControl: false, 
           attributionControl: false, 
           zoomSnap: 0, 
           zoomDelta: 0.5, 
           wheelPxPerZoomLevel: 10 
        }).setView([initialCenter.lat, initialCenter.lng], initialZoom);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(map);
        
        map.createPane('shapesPane').style.zIndex = '450'; 
        map.createPane('linesPane').style.zIndex = '550'; 
        map.createPane('cardsPane').style.zIndex = '700'; 

        const reportViewport = () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            onViewportChange({ lat: center.lat, lng: center.lng }, zoom);
        };

        const updateBounds = () => {
            const bounds = map.getBounds();
            onBoundsChange({
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest()
            });
            reportViewport();
        };

        map.on('zoomend', () => {
            setMapZoom(map.getZoom());
            updateBounds();
        });
        map.on('moveend', updateBounds);
        
        updateBounds();
        mapInstanceRef.current = map;
      }
    };

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = initMap;
      document.head.appendChild(script);
    } else if ((window as any).L) {
      initMap();
    }

    return () => {};
  }, []); 

  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const map = mapInstanceRef.current;
    const layersMap = layersMapRef.current;

    // 1. Determine which events SHOULD be on screen (Active)
    const activeEvents = events.filter(event => {
      const startVal = toSliderValue(event.start.year);
      const endVal = event.end ? toSliderValue(event.end.year) : null;
      
      let isActive = false;
      if (jumpTargetId) {
        isActive = (jumpTargetId === "___ANIMATING___") ? false : event.id === jumpTargetId;
      } else {
        isActive = endVal !== null 
            ? (currentDate >= startVal && currentDate <= endVal) 
            : (Math.abs(currentDate - startVal) <= dynamicThreshold);
      }
      return isActive;
    });

    const layoutMap = calculateSmartLayout(activeEvents, map);

    // 2. CLEANUP PHASE [CRITICAL FIX]
    // Instead of iterating over 'events' (which might miss removed items),
    // we iterate over 'layersMap' (what is CURRENTLY on screen).
    
    // We create a list of IDs to remove to avoid modifying the Map while iterating
    const idsToRemove: string[] = [];

    layersMap.forEach((layerGroup, eventId) => {
        // If the event currently on map is NOT in the new active list...
        if (!activeEvents.find(ae => ae.id === eventId)) {
             const cardEl = layerGroup.card.getElement();
             if (cardEl) {
                 // Fade out
                 cardEl.style.transition = 'opacity 0.5s ease-out'; 
                 cardEl.style.opacity = '0';
                 cardEl.style.pointerEvents = 'none'; 
             }
             const lineEl = layerGroup.line.getElement();
             if (lineEl) {
                lineEl.style.transition = 'opacity 0.5s ease-out'; 
                lineEl.style.opacity = '0';
             }
             if(layerGroup.shape) {
                 // Shapes don't fade well with CSS usually, remove immediately or fade via options
                 layerGroup.shape.remove(); 
             }
             
             // Mark for garbage collection from our map
             // We use a timeout to let the fade animation finish before DOM removal
             // But for React logic, simple removal from tracking is often enough.
             // Here we just mark it as "should act like deleted".
             // In a perfect world, we'd setTimeout -> layer.remove().
             // For now, we'll keep the DOM element but hidden (opacity 0) to avoid flicker if it comes back soon.
             // But we MUST allow it to update if it comes back.
        }
    });

    // 3. RENDER PHASE
    activeEvents.forEach(event => {
        const layout = layoutMap.get(event.id) || { offsetX: 0, offsetY: 0 };
        const { offsetX, offsetY } = layout;
        
        const BASE_LIFT = -15; 
        const finalY = offsetY + BASE_LIFT;
        const finalX = offsetX;

        const CARD_HEIGHT = event.imageUrl ? 220 : 120; 
        const lineTargetY = finalY - (CARD_HEIGHT / 2); 
        const lineLen = Math.sqrt(finalX * finalX + lineTargetY * lineTargetY);
        const lineAngle = Math.atan2(lineTargetY, finalX) * (180 / Math.PI);

        if (!layersMap.has(event.id)) {
            // ... (CREATE Logic - Unchanged) ...
            const lineHtml = `
               <div style="position: relative; width: 0; height: 0;">
                  <div style="position: absolute; top: 0; left: 0; width: 12px; height: 12px; background: #2563eb; border: 2px solid white; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 10;"></div>
                  <div style="position: absolute; top: 0; left: 0; width: ${lineLen}px; height: 2px; background: #2563eb; transform-origin: 0 50%; transform: rotate(${lineAngle}deg); z-index: -1;"></div>
               </div>
            `;
            const lineIcon = L.divIcon({ className: '', html: lineHtml, iconSize: [0,0] });
            const lineMarker = L.marker([event.location.lat, event.location.lng], { icon: lineIcon, pane: 'linesPane' }).addTo(map);

            const cardHtml = `
               <div class="card-wrapper" style="
                   position: absolute; left: 0; top: 0; 
                   transform: translate(-50%, -100%) translate(${finalX}px, ${finalY}px); 
                   width: 240px; 
                   transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                   cursor: pointer; 
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
            
            cardMarker.on('click', (e: any) => {
                L.DomEvent.stopPropagation(e); 
                onEventSelect(event);
            });

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
            // ... (UPDATE Logic - Unchanged) ...
            const { card, line, shape } = layersMap.get(event.id)!;
            
            // Re-generate HTML to update position (finalX, finalY)
            const cardHtml = `
               <div style="
                   position: absolute; left: 0; top: 0; 
                   transform: translate(-50%, -100%) translate(${finalX}px, ${finalY}px); 
                   width: 240px; 
                   transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                   cursor: pointer;
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

            // Ensure Visible (in case it was fading out)
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
            if (shape && !map.hasLayer(shape)) {
                shape.addTo(map);
            }
        }
    });

  }, [currentDate, events, dynamicThreshold, jumpTargetId, mapZoom]);

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};