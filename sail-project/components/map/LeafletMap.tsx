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
  const layersMapRef = useRef<Map<string, { dot: any, card?: any, line?: any, shape?: any }>>(new Map());
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());

  // Dynamic Color Interpolator (Cyan -> Blue -> Indigo)
  const getDotColor = (importance: number) => {
    // Clamp 1-10
    const val = Math.max(1, Math.min(10, importance));
    // Normalize to 0-1
    const t = (val - 1) / 9;

    // RGB Start (Cyan-400: 34, 211, 238)
    const start = [34, 211, 238];
    // RGB Mid (Blue-500: 59, 130, 246) at t=0.5
    const mid = [59, 130, 246];
    // RGB End (Indigo-900: 49, 46, 129)
    const end = [49, 46, 129];

    let r, g, b;
    if (t < 0.5) {
      const localT = t * 2;
      r = Math.round(start[0] + (mid[0] - start[0]) * localT);
      g = Math.round(start[1] + (mid[1] - start[1]) * localT);
      b = Math.round(start[2] + (mid[2] - start[2]) * localT);
    } else {
      const localT = (t - 0.5) * 2;
      r = Math.round(mid[0] + (end[0] - mid[0]) * localT);
      g = Math.round(mid[1] + (end[1] - mid[1]) * localT);
      b = Math.round(mid[2] + (end[2] - mid[2]) * localT);
    }
    return `rgb(${r}, ${g}, ${b})`;
  };

  const dynamicThreshold = Math.max(0.5, (viewRange.max - viewRange.min) / 100);

  useEffect(() => {
    // Inject Styles for Dot Hover and Card animations
    const styleId = 'leaflet-map-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
            .map-dot {
                transition: transform 0.05s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .map-dot:hover {
                transform: scale(1.2) !important;
                z-index: 9999;
            }
            .card-wrapper {
                will-change: transform;
            }
        `;
      document.head.appendChild(style);
    }

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
          wheelPxPerZoomLevel: 10,
          minZoom: 2.45,
          maxBounds: [[-90, -180], [90, 180]],
          maxBoundsViscosity: 1.0
        }).setView([initialCenter.lat, initialCenter.lng], initialZoom);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
          noWrap: true,
          bounds: [[-90, -180], [90, 180]]
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

        // [CRITICAL FIX] Force map to re-calculate size after mounting
        // This fixes the bug where initial bounds are incorrect/zero-size
        // causing events (like WWI) to be filtered out until the map is moved.
        setTimeout(() => {
          map.invalidateSize();
          updateBounds();
        }, 100);

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

    return () => { };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const map = mapInstanceRef.current;
    const layersMap = layersMapRef.current;

    // 1. Determine Active Events
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

    // 2. Cleanup (Iterate over existing layers to remove stale ones)
    layersMap.forEach((layerGroup, eventId) => {
      const isActive = activeEvents.find(ae => ae.id === eventId);
      const isExpanded = expandedEventIds.has(eventId);

      // Remove Dot if no longer active
      if (!isActive) {
        if (layerGroup.dot) layerGroup.dot.remove();
        if (layerGroup.card) layerGroup.card.remove();
        if (layerGroup.line) layerGroup.line.remove();
        if (layerGroup.shape) layerGroup.shape.remove();
        layersMap.delete(eventId);
        return;
      }

      // Handle Collapse State (Remove expanded elements if they exist but shouldn't)
      if (!isExpanded) {
        if (layerGroup.card) { layerGroup.card.remove(); delete layerGroup.card; }
        if (layerGroup.line) { layerGroup.line.remove(); delete layerGroup.line; }
        if (layerGroup.shape) { layerGroup.shape.remove(); delete layerGroup.shape; }
      }
    });

    // 3. Render Active
    activeEvents.forEach(event => {
      const isExpanded = expandedEventIds.has(event.id);

      // --- DOT RENDERING (Always) ---
      let layers = layersMap.get(event.id);
      const dotColor = getDotColor(event.importance || 1);

      if (!layers) {
        // Initialize Dot
        const dotHtml = `
            <div style="
                width: 12px; height: 12px; 
                background: ${dotColor}; 
                border: 2px solid white; 
                border-radius: 50%; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                cursor: pointer;
            " class="map-dot"></div>
          `;
        const dotIcon = L.divIcon({ className: '', html: dotHtml, iconSize: [12, 12] });
        const dotMarker = L.marker([event.location.lat, event.location.lng], { icon: dotIcon, zIndexOffset: 2000 }).addTo(map);

        dotMarker.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e);
          setExpandedEventIds(prev => {
            const next = new Set(prev);
            if (next.has(event.id)) {
              next.delete(event.id);
            } else {
              next.add(event.id);
            }
            return next;
          });
        });

        layers = { dot: dotMarker };
        layersMap.set(event.id, layers);
      } else {
        // Update Dot Position? (If moving) - Assuming static for now, but good practice
        layers.dot.setLatLng([event.location.lat, event.location.lng]);
      }


      // --- EXPANDED RENDERING (Conditional) ---
      if (isExpanded) {
        const layout = layoutMap.get(event.id) || { offsetX: 0, offsetY: 0 };
        const { offsetX, offsetY } = layout;

        const BASE_LIFT = -25; // Higher lift for visibility
        const finalY = offsetY + BASE_LIFT;
        const finalX = offsetX;

        // Line Logic
        const lineTargetY = finalY - 10; // Connect to bottom of card roughly
        const lineLen = Math.sqrt(finalX * finalX + lineTargetY * lineTargetY);
        const lineAngle = Math.atan2(lineTargetY, finalX) * (180 / Math.PI);

        // CREATE or UPDATE Expanded Layers
        if (!layers.card) {
          // --- Create Line ---
          const lineHtml = `
               <div style="position: relative; width: 0; height: 0;">
                  <div style="position: absolute; top: 0; left: 0; width: ${lineLen}px; height: 2px; background: ${dotColor}; transform-origin: 0 50%; transform: rotate(${lineAngle}deg); opacity: 0.6;"></div>
               </div>
            `;
          const lineIcon = L.divIcon({ className: '', html: lineHtml, iconSize: [0, 0] });
          const lineMarker = L.marker([event.location.lat, event.location.lng], { icon: lineIcon, pane: 'linesPane' }).addTo(map);
          layers.line = lineMarker;

          // --- Create Card ---
          // Card HTML with Close Button
          const cardContentHtml = `
               <div class="card-wrapper" style="
                   position: absolute; left: 0; top: 0; 
                   transform: translate(-50%, -100%) translate(${finalX}px, ${finalY}px); 
                   width: 240px; 
                   transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
                   cursor: default; 
               ">
                  <div style="background: white; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.25); overflow: hidden; font-family: system-ui; position: relative;">
                      
                      <!-- Close Button -->
                      <button class="close-btn" style="
                          position: absolute; top: 6px; right: 6px; 
                          width: 24px; height: 24px; 
                          background: white; border-radius: 50%; border: none; 
                          color: #1e293b; 
                          cursor: pointer; z-index: 50; display: flex; align-items: center; justify-content: center;
                          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                          transition: background 0.1s;
                          padding: 0;
                      ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>

                      ${event.imageUrl ? `<div style="height: 120px; width: 100%; background-image: url('${event.imageUrl}'); background-size: cover; background-position: center;"></div>` : ''}
                      <div class="card-body" style="padding: 12px; cursor: pointer;">
                          <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">${event.title}</div>
                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;">
                              <span style="font-size: 10px; font-weight: 600; background: #e0f2fe; color: #0284c7; padding: 2px 6px; rounded: 4px;">${formatEventDateRange(event)}</span>
                              <span style="font-size: 10px; font-weight: 500; background: #f3f4f6; color: #4b5563; padding: 2px 6px; rounded: 4px; display: flex; align-items: center; gap: 3px;">${getLocationString(event)}</span>
                          </div>
                      </div>
                  </div>
               </div>
            `;
          const cardIcon = L.divIcon({ className: '', html: cardContentHtml, iconSize: [0, 0] });
          const cardMarker = L.marker([event.location.lat, event.location.lng], { icon: cardIcon, pane: 'cardsPane' }).addTo(map);

          // Attach Events Immediately
          const attachCardEvents = () => {
            const el = cardMarker.getElement();
            if (el) {
              const closeBtn = el.querySelector('.close-btn');
              // Select the main card container for the click target instead of just card-body
              const cardContainer = el.querySelector('.card-wrapper > div');

              if (closeBtn) {
                // Use standard DOM event listener with stopPropagation
                closeBtn.addEventListener('click', (e: any) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setExpandedEventIds(prev => {
                    const next = new Set(prev);
                    next.delete(event.id);
                    return next;
                  });
                });
                // Prevent Leaflet map click-through on the button specifically
                L.DomEvent.disableClickPropagation(closeBtn);
              }

              if (cardContainer) {
                // Make the entire card container clickable
                cardContainer.addEventListener('click', (e: any) => {
                  e.preventDefault();
                  // Check if the click originated from the close button (just in case)
                  if (e.target.closest('.close-btn')) return;

                  e.stopPropagation();
                  onEventSelect(event);
                });
                // Prevent Leaflet map click-through on the card
                L.DomEvent.disableClickPropagation(cardContainer);
              }
            }
          };

          // Invoke immediately - element refers to the L.divIcon wrapper which should be in DOM by now
          attachCardEvents();

          layers.card = cardMarker;

          // --- Create Shape ---
          if (event.location.granularity !== 'spot') {
            if (event.location.regionId && PREDEFINED_REGIONS[event.location.regionId]) {
              const latLngs = PREDEFINED_REGIONS[event.location.regionId];
              const polygon = L.polygon(latLngs, { color: dotColor, fillColor: dotColor, fillOpacity: 0.1, weight: 2, opacity: 0.6 }).addTo(map);
              polygon.bringToBack();
              layers.shape = polygon;
            } else {
              const circle = L.circle([event.location.lat, event.location.lng], { color: dotColor, radius: event.location.customRadius || 10000, fillOpacity: 0.1 }).addTo(map);
              circle.bringToBack();
              layers.shape = circle;
            }
          }

        } else {
          // UPDATE Existing Layers (Animation)
          const finalY = offsetY + BASE_LIFT;
          const lineTargetY = finalY - (event.imageUrl ? 110 : 60); // Approx
          const lineLen = Math.sqrt(offsetX * offsetX + lineTargetY * lineTargetY);
          const lineAngle = Math.atan2(lineTargetY, offsetX) * (180 / Math.PI);

          // Update Line
          const lineHtml = `
               <div style="position: relative; width: 0; height: 0;">
                  <div style="position: absolute; top: 0; left: 0; width: ${lineLen}px; height: 2px; background: ${dotColor}; transform-origin: 0 50%; transform: rotate(${lineAngle}deg); opacity: 0.6;"></div>
               </div>
             `;
          layers.line.setIcon(L.divIcon({ className: '', html: lineHtml, iconSize: [0, 0] }));

          // Update Card Transform
          const cardEl = layers.card.getElement();
          if (cardEl) {
            const wrapper = cardEl.querySelector('.card-wrapper');
            if (wrapper) {
              wrapper.style.transform = `translate(-50%, -100%) translate(${offsetX}px, ${finalY}px)`;
            }
          }
        }
      }
    });

  }, [currentDate, events, dynamicThreshold, jumpTargetId, mapZoom, expandedEventIds]);

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};