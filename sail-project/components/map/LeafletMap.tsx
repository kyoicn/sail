import React, { useState, useEffect, useRef } from 'react';
import { EventData, MapBounds } from '../../types';
import { PREDEFINED_REGIONS } from '../../lib/constants';
import { calculateSmartLayout } from '../../lib/layout-engine';
import { toSliderValue, getAstroYear } from '../../lib/time-engine';
import { getDotHtml, getLineHtml, getCardHtml } from './MarkerTemplates';

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

  // Dynamic Threshold: 1/200 of the visible span (0.5% of viewport)
  // This matches "slider minimum movement" feel better than a hardcoded floor.
  const dynamicThreshold = (viewRange.max - viewRange.min) / 200;

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
          zoomControl: true,
          doubleClickZoom: false,
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
      // [FIX] Use precise astro year to get the fractional part of the year
      // Then map it to slider space (which shifts AD years by -1)
      const startFraction = getAstroYear(event.start) - event.start.year;
      const startVal = toSliderValue(event.start.year) + startFraction;

      let endVal = null;
      if (event.end) {
        const endFraction = getAstroYear(event.end) - event.end.year;
        endVal = toSliderValue(event.end.year) + endFraction;
      }

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
        // Initialize Dot
        const dotHtml = getDotHtml(dotColor);
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
          const lineHtml = getLineHtml(lineLen, lineAngle, dotColor);
          const lineIcon = L.divIcon({ className: '', html: lineHtml, iconSize: [0, 0] });
          const lineMarker = L.marker([event.location.lat, event.location.lng], { icon: lineIcon, pane: 'linesPane' }).addTo(map);
          layers.line = lineMarker;

          // --- Create Card ---
          // Card HTML with Close Button
          const cardContentHtml = getCardHtml(event, finalX, finalY);
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
          const lineHtml = getLineHtml(lineLen, lineAngle, dotColor);
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