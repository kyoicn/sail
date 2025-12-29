import React, { useState, useEffect, useRef } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { PREDEFINED_AREAS, HEATMAP_STYLES, DOT_STYLES, DotStyleConfig, MAP_STYLES } from '../../lib/constants';
import { calculateSmartLayout } from '../../lib/layout-engine';
import { toSliderValue, getAstroYear } from '../../lib/time-engine';
import { getDotHtml, getLineHtml, getCardHtml, getArrowHtml } from './MarkerTemplates';

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
  expandedEventIds: Set<string>;
  onToggleExpand: (eventId: string) => void;
  zoomAction?: { type: 'in' | 'out', id: number } | null;
  interactionMode: 'exploration' | 'investigation' | 'playback';
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  activeAreaShape?: any | null; // GeoJSON MultiPolygon
  theme: 'light' | 'dark';
  mapStyle: string; // [NEW] key from MAP_STYLES
  // [NEW] Heatmap Props
  heatmapData: EventData[];
  showHeatmap: boolean;
  heatmapStyle?: string;
  showDots: boolean;
  dotStyle?: string;
  onEnterFocusMode?: (event: EventData) => void;
  focusStack?: string[];
  sequenceEvents?: EventData[]; // [NEW] Full list for connecting lines
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
  onEventSelect,
  expandedEventIds,
  onToggleExpand,
  zoomAction,
  interactionMode,
  hoveredEventId,
  setHoveredEventId,
  activeAreaShape,
  theme,
  mapStyle = 'voyager',
  heatmapData,
  showHeatmap,
  heatmapStyle = 'classic',
  showDots,
  dotStyle = 'classic',
  onEnterFocusMode,
  focusStack = [],
  sequenceEvents = [] // Default empty
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersMapRef = useRef<Map<string, { dot: any, card?: any, line?: any, shape?: any, sequenceLine?: any, sequenceArrow?: any }>>(new Map());
  const [mapZoom, setMapZoom] = useState(initialZoom);
  const [isHeatLoaded, setIsHeatLoaded] = useState(false); // [NEW] Track lib loading

  // [OPTIMIZATION] Refs to track previous visual state to avoid redundant DOM updates
  const prevVisualState = useRef({ zoom: initialZoom, span: 0, dotStyle: dotStyle });

  // Dynamic Color Interpolator
  const getDotColor = (importance: number, style: DotStyleConfig) => {
    // Clamp 1-10
    const val = Math.max(1, Math.min(10, importance));
    // Normalize to 0-1
    const t = (val - 1) / 9;

    const hexToRgb = (hex: string): [number, number, number] => {
      // Allow 6 or 8 digit hex (ignore alpha if present)
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})(?:[a-f\d]{2})?$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [0, 0, 0];
    };

    const start = hexToRgb(style.colors.start);
    const mid = hexToRgb(style.colors.mid);
    const end = hexToRgb(style.colors.end);

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

  // Dynamic Threshold
  const dynamicThreshold = (viewRange.max - viewRange.min) / 200;

  useEffect(() => {
    // Inject Styles for Dot Hover and Card animations
    const styleId = 'leaflet-map-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
            .map-dot {
                /* No transition for static size */
            }
            .map-dot:hover {
                /* transform: scale(1.2) !important; REMOVED */
                z-index: 9999;
            }
            .leaflet-dot-wrapper {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
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

    const loadHeatmapLib = () => {
      if (!document.getElementById('leaflet-heat-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-heat-js';
        script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
        script.onload = () => {
          setIsHeatLoaded(true);
        };
        document.head.appendChild(script);
      } else if ((window as any).L && (window as any).L.heatLayer) {
        setIsHeatLoaded(true);
      }
    };

    const initMap = () => {
      if (mapRef.current && !mapInstanceRef.current && (window as any).L) {
        const L = (window as any).L;

        // [DEPENDENCY] Load Heatmap Lib NOW that L is ready
        loadHeatmapLib();

        const map = L.map(mapRef.current, {
          zoomControl: false,
          doubleClickZoom: false,
          attributionControl: false,
          zoomSnap: 0,
          zoomDelta: 0.5,
          wheelPxPerZoomLevel: 10,
          minZoom: 2.45,
          maxBounds: [[-90, -180], [90, 180]],
          maxBoundsViscosity: 1.0
        }).setView([initialCenter.lat, initialCenter.lng], initialZoom);

        const config = MAP_STYLES[mapStyle] || MAP_STYLES['voyager'];
        const tileLayer = L.tileLayer(config.url, {
          attribution: config.attribution,
          subdomains: config.subdomains || 'abc',
          maxZoom: config.maxZoom || 19,
          noWrap: true,
          bounds: [[-90, -180], [90, 180]]
        }).addTo(map);

        (map as any)._tileLayer = tileLayer;

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
    if (!mapInstanceRef.current || !zoomAction) return;
    const map = mapInstanceRef.current;
    if (zoomAction.type === 'in') map.zoomIn();
    if (zoomAction.type === 'out') map.zoomOut();
  }, [zoomAction]);

  // Update Tile Layer when mapStyle changes
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const tileLayer = (map as any)._tileLayer;
    const config = MAP_STYLES[mapStyle] || MAP_STYLES['voyager'];

    if (tileLayer) {
      tileLayer.setUrl(config.url);
    }
  }, [mapStyle]);


  useEffect(() => {
    if (!mapInstanceRef.current || !(window as any).L) return;
    const map = mapInstanceRef.current;
    const layersMap = layersMapRef.current;

    const activeEvents = events.filter(event => {
      const startFraction = getAstroYear(event.start) - event.start.year;
      const startVal = toSliderValue(event.start.year) + startFraction;

      let endVal = null;
      if (event.end) {
        const endFraction = getAstroYear(event.end) - event.end.year;
        endVal = toSliderValue(event.end.year) + endFraction;
      }

      let isActive = false;
      if (interactionMode === 'exploration') {
        if (endVal !== null) {
          isActive = startVal <= viewRange.max && endVal >= viewRange.min;
        } else {
          isActive = startVal >= viewRange.min && startVal <= viewRange.max;
        }
      } else if (interactionMode === 'investigation') {
        const threshold = (viewRange.max - viewRange.min) * 0.01;
        isActive = Math.abs(currentDate - startVal) <= threshold;
      } else {
        isActive = startVal <= currentDate;
      }
      return isActive;
    });

    const eventsToRender = (interactionMode === 'exploration' && !showDots)
      ? activeEvents.filter(e => expandedEventIds.has(e.id))
      : activeEvents;


    const expandedActiveEvents = eventsToRender.filter(e => expandedEventIds.has(e.id));
    const layoutMap = calculateSmartLayout(expandedActiveEvents, map);

    // [REMOVED] Sort for sequence lines (now handled by sequenceEvents prop)


    layersMap.forEach((layerGroup, eventId) => {
      const isActive = eventsToRender.find(ae => ae.id === eventId);
      const isExpanded = expandedEventIds.has(eventId);
      const isHovered = hoveredEventId === eventId;
      const shouldShowCard = isExpanded || isHovered;

      if (!isActive) {
        if (layerGroup.dot) layerGroup.dot.remove();
        if (layerGroup.card) layerGroup.card.remove();
        if (layerGroup.line) layerGroup.line.remove();
        if (layerGroup.shape) layerGroup.shape.remove();
        if (layerGroup.sequenceLine) { layerGroup.sequenceLine.remove(); delete layerGroup.sequenceLine; }
        if (layerGroup.sequenceArrow) { layerGroup.sequenceArrow.remove(); delete layerGroup.sequenceArrow; }
        layersMap.delete(eventId);
        return;
      }

      if (!shouldShowCard) {
        if (layerGroup.card) { layerGroup.card.remove(); delete layerGroup.card; }
        if (layerGroup.line) { layerGroup.line.remove(); delete layerGroup.line; }
        if (layerGroup.shape) { layerGroup.shape.remove(); delete layerGroup.shape; }
      }
    });

    // Create a map of index for quick lookup
    const eventIndexMap = new Map<string, number>();
    eventsToRender.forEach((e, i) => eventIndexMap.set(e.id, i));

    eventsToRender.forEach((event, index) => {
      const isExpanded = expandedEventIds.has(event.id);
      const isHovered = hoveredEventId === event.id;
      const shouldShowCard = isExpanded || isHovered;

      let layers = layersMap.get(event.id);

      const isFocused = focusStack.length > 0 && focusStack[focusStack.length - 1] === event.id;
      const isContainer = (event.children?.length ?? 0) > 0;

      let styleKey = dotStyle; // Current global theme as fallback
      if (isFocused) {
        styleKey = 'focus';
      } else if (isContainer) {
        styleKey = 'volcano';
      } else {
        styleKey = 'classic';
      }

      const style = DOT_STYLES[styleKey] || DOT_STYLES['classic'];
      const dotColor = getDotColor(event.importance || 1, style);

      const span = viewRange.max - viewRange.min;
      const tTime = Math.max(0, Math.min(1, (span - 50) / (500 - 50)));
      const timeFactor = 1.1 - (tTime * 0.2);

      const zoomClamped = Math.max(2, Math.min(12, mapZoom));
      const tZoom = (zoomClamped - 2) / 10;

      const baseMin = 6 + (tZoom * 4);
      const baseMax = 20 + (tZoom * 40);

      const imp = event.importance || 1;
      const normalizedImp = (Math.max(1, Math.min(10, imp)) - 1) / 9;

      const rawSize = baseMin + (normalizedImp * (baseMax - baseMin));
      // [FIX] Apply multiplier HERE so both visual and anchor use the same size
      const finalSize = (rawSize * timeFactor) * style.sizeMultiplier;

      const dotHtml = getDotHtml(dotColor, finalSize, style);

      // [OPTIMIZATION] Use a fixed wrapper size to prevent Leaflet from thrashing the DOM (flickering) when size changes.
      // We center the dot using flexbox in the wrapper.
      const WRAPPER_SIZE = 60;

      if (!layers) {
        // Initial creation
        const dotIcon = L.divIcon({
          className: 'leaflet-dot-wrapper',
          html: dotHtml,
          iconSize: [WRAPPER_SIZE, WRAPPER_SIZE],
          iconAnchor: [WRAPPER_SIZE / 2, WRAPPER_SIZE / 2]
        });
        const dotMarker = L.marker([event.location.lat, event.location.lng], { icon: dotIcon, zIndexOffset: isFocused ? 3000 : 2000 }).addTo(map);

        dotMarker.on('click', (e: any) => {
          L.DomEvent.stopPropagation(e);
          onToggleExpand(event.id);
        });

        dotMarker.on('mouseover', () => setHoveredEventId(event.id));
        dotMarker.on('mouseout', () => setHoveredEventId(null));

        layers = { dot: dotMarker };
        layersMap.set(event.id, layers);
      } else {
        const spanDiff = Math.abs((viewRange.max - viewRange.min) - prevVisualState.current.span);
        const zoomDiff = Math.abs(mapZoom - prevVisualState.current.zoom);
        const prevStyle = (layers.dot as any)._styleKey;
        const styleChanged = prevStyle !== styleKey;
        (layers.dot as any)._styleKey = styleKey;

        const needsVisualUpdate = spanDiff > 0.0001 || zoomDiff > 0.1 || styleChanged || prevVisualState.current.dotStyle !== dotStyle;

        if (needsVisualUpdate) {
          // [PATCH] Directly update innerHTML to avoid Leaflet setIcon() flicker
          const el = layers.dot.getElement();
          if (el) {
            // Only update if content changed (though needsVisualUpdate suggests it did)
            // We can check slightly cheaper strictly on html string if needed, but innerHTML set is fast enough compared to setIcon replacement.
            if (el.innerHTML !== dotHtml) {
              el.innerHTML = dotHtml;
            }
          }
        }
        layers.dot.setLatLng([event.location.lat, event.location.lng]);
        if (isFocused) layers.dot.setZIndexOffset(3000);
        else layers.dot.setZIndexOffset(2000);
      }

      if (shouldShowCard) {
        const layout = layoutMap.get(event.id) || { offsetX: 0, offsetY: 0 };
        const { offsetX, offsetY } = layout;

        const BASE_LIFT = -25;
        const finalY = offsetY + BASE_LIFT;
        const finalX = offsetX;

        const lineTargetY = finalY - 10;
        const lineLen = Math.sqrt(finalX * finalX + lineTargetY * lineTargetY);
        const lineAngle = Math.atan2(lineTargetY, finalX) * (180 / Math.PI);

        if (!layers.card) {
          const lineHtml = getLineHtml(lineLen, lineAngle, dotColor);
          const lineIcon = L.divIcon({ className: '', html: lineHtml, iconSize: [0, 0] });
          const lineMarker = L.marker([event.location.lat, event.location.lng], { icon: lineIcon, pane: 'linesPane' }).addTo(map);
          layers.line = lineMarker;

          const hasChildren = (event.children?.length ?? 0) > 0;

          const cardContentHtml = getCardHtml(event, finalX, finalY, hasChildren, focusStack);
          const cardIcon = L.divIcon({ className: '', html: cardContentHtml, iconSize: [0, 0] });
          const cardMarker = L.marker([event.location.lat, event.location.lng], { icon: cardIcon, pane: 'cardsPane' }).addTo(map);

          const attachCardEvents = () => {
            const el = cardMarker.getElement();
            if (el) {
              const closeBtn = el.querySelector('.close-btn');
              const cardContainer = el.querySelector('.card-wrapper > div');

              if (closeBtn) {
                closeBtn.addEventListener('click', (e: any) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleExpand(event.id);
                });
                L.DomEvent.disableClickPropagation(closeBtn);
              }

              if (cardContainer) {
                cardContainer.addEventListener('click', (e: any) => {
                  e.preventDefault();
                  if (e.target.closest('.close-btn')) return;
                  e.stopPropagation();
                  onEventSelect(event);
                });
                L.DomEvent.disableClickPropagation(cardContainer);
                L.DomEvent.disableClickPropagation(cardContainer);
              }

              // Attach Focus Button Event
              const focusBtn = el.querySelector('.focus-btn');
              if (focusBtn && onEnterFocusMode) {
                focusBtn.addEventListener('click', (e: any) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onEnterFocusMode(event);
                });
                L.DomEvent.disableClickPropagation(focusBtn);
              }
            }
          };

          attachCardEvents();
          layers.card = cardMarker;

          if (event.location.granularity !== 'spot') {
            // Check for predefined area polygon (legacy regionId replacement)
            if (event.location.areaId && PREDEFINED_AREAS[event.location.areaId]) {
              const latLngs = PREDEFINED_AREAS[event.location.areaId];
              const polygon = L.polygon(latLngs, { color: dotColor, fillColor: dotColor, fillOpacity: 0.1, weight: 2, opacity: 0.6 }).addTo(map);
              polygon.bringToBack();
              layers.shape = polygon;
            } else {
              // specific radius or default
              const circle = L.circle([event.location.lat, event.location.lng], { color: dotColor, radius: event.location.customRadius || 10000, fillOpacity: 0.1 }).addTo(map);
              circle.bringToBack();
              layers.shape = circle;
            }
          }

        } else {
          const finalY = offsetY + BASE_LIFT;
          const lineTargetY = finalY - (event.imageUrl ? 110 : 60);
          const lineLen = Math.sqrt(offsetX * offsetX + lineTargetY * lineTargetY);
          const lineAngle = Math.atan2(lineTargetY, offsetX) * (180 / Math.PI);

          const lineHtml = getLineHtml(lineLen, lineAngle, dotColor);
          layers.line.setIcon(L.divIcon({ className: '', html: lineHtml, iconSize: [0, 0] }));

          const cardEl = layers.card.getElement();
          if (cardEl) {
            const wrapper = cardEl.querySelector('.card-wrapper');
            if (wrapper) {
              wrapper.style.transform = `translate(-50%, -100%) translate(${offsetX}px, ${finalY}px)`;
            }
          }
        }
      }

      // [REMOVED] Sequence Lines (Moved to separate effect)

    });

    prevVisualState.current = {
      zoom: mapZoom,
      span: viewRange.max - viewRange.min,
      dotStyle: dotStyle
    };

  }, [currentDate, events, dynamicThreshold, jumpTargetId, mapZoom, expandedEventIds, interactionMode, viewRange.min, viewRange.max, hoveredEventId, showDots, dotStyle]);

  // [NEW] Separate Effect for Persistent Sequence Lines (Focus Mode)
  // This draws lines between all children of the focused event, regardless of visibility.
  const sequenceLayerRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const L = window.L as any;

    // 1. Cleanup old sequence layers
    sequenceLayerRef.current.forEach(layer => layer.remove());
    sequenceLayerRef.current = [];

    // 2. Sorting (Safety check, though page.tsx should handle it)
    // We assume sequenceEvents is already sorted by page.tsx

    // 3. Render Lines
    if (sequenceEvents.length > 1) {
      for (let i = 0; i < sequenceEvents.length - 1; i++) {
        const event = sequenceEvents[i];
        const nextEvent = sequenceEvents[i + 1];

        const startLatLng = [event.location.lat, event.location.lng];
        const endLatLng = [nextEvent.location.lat, nextEvent.location.lng];
        const color = '#3b82f6'; // Fixed blue color for sequence lines or reuse dot style logic?

        // Draw Line
        const polyline = L.polyline([startLatLng, endLatLng], {
          color: color,
          weight: 2,
          opacity: 0.5,
          dashArray: '6, 8',
          pane: 'linesPane'
        }).addTo(map);
        sequenceLayerRef.current.push(polyline);

        // Draw Arrow (Midpoint) using Projection
        const p1Layer = map.latLngToLayerPoint(L.latLng(startLatLng));
        const p2Layer = map.latLngToLayerPoint(L.latLng(endLatLng));
        const midPoint = p1Layer.add(p2Layer).divideBy(2);
        const midLatLng = map.layerPointToLatLng(midPoint);

        // Calculate Angle
        const p1Container = map.latLngToContainerPoint(L.latLng(startLatLng));
        const p2Container = map.latLngToContainerPoint(L.latLng(endLatLng));
        const angle = Math.atan2(p2Container.y - p1Container.y, p2Container.x - p1Container.x) * (180 / Math.PI);

        const arrowHtml = getArrowHtml(color, angle);

        const arrowIcon = L.divIcon({
          className: '',
          html: arrowHtml,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        const arrowMarker = L.marker([midLatLng.lat, midLatLng.lng], {
          icon: arrowIcon,
          pane: 'linesPane',
          zIndexOffset: -100
        }).addTo(map);

        sequenceLayerRef.current.push(arrowMarker);
      }
    }

  }, [sequenceEvents, mapZoom]); // Re-render when zoom changes to update projected midpoints/angles?
  // Note: midpoints and angles update on zoom/move automatically for markers, 
  // BUT the angle calculation depends on screen coordinates which change on rotation (if enabled) or projection.
  // Standard Leaflet markers update position on zoom. 
  // HOWEVER, we bake the 'angle' into the HTML style. 
  // Does Leaflet re-render the icon on zoom? No, it just moves it.
  // So if the map rotates or the angle changes due to projection distortion (Mercator preserves angles locally though),
  // we might need to update. Mercator makes conformal angles, so angle should be constant?
  // Actually, on zoom, the screen coordinates change but relative angle stays same in Mercator?
  // Let's rely on Leaflet moveend to re-calc?
  // For now, dependency on mapZoom re-triggers full redraw which is safe but expensive.
  // Ideally we hook into 'viewreset' or 'move' but that's what map re-renders usually do.


  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const L = window.L as any;

    if ((map as any)._heatLayer) {
      map.removeLayer((map as any)._heatLayer);
      (map as any)._heatLayer = null;
    }

    if (interactionMode === 'exploration' && showHeatmap && L.heatLayer) {
      const activeHeatPoints = heatmapData.filter(event => {
        const startFraction = getAstroYear(event.start) - event.start.year;
        const startVal = toSliderValue(event.start.year) + startFraction;
        let endVal = null;
        if (event.end) {
          const endFraction = getAstroYear(event.end) - event.end.year;
          endVal = toSliderValue(event.end.year) + endFraction;
        }

        if (endVal !== null) {
          return startVal <= viewRange.max && endVal >= viewRange.min;
        } else {
          return startVal >= viewRange.min && startVal <= viewRange.max;
        }
      }).map(e => {
        const intensity = 0.5 + ((e.importance || 1) / 20);
        return [e.location.lat, e.location.lng, intensity];
      });

      if (activeHeatPoints.length > 0) {
        const styleConfig = HEATMAP_STYLES[heatmapStyle]?.config || HEATMAP_STYLES['classic'].config;

        const heat = L.heatLayer(activeHeatPoints, {
          radius: styleConfig.radius,
          blur: styleConfig.blur,
          minOpacity: styleConfig.minOpacity,
          maxZoom: 10,
          gradient: styleConfig.gradient
        }).addTo(map);
        (map as any)._heatLayer = heat;
      }
    }

  }, [heatmapData, showHeatmap, heatmapStyle, interactionMode, viewRange.min, viewRange.max, activeAreaShape, isHeatLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;

    const existingLayer = (map as any)._activeShapeLayer;
    if (existingLayer) {
      map.removeLayer(existingLayer);
      (map as any)._activeShapeLayer = null;
    }

    if (activeAreaShape) {
      const shapeLayer = L.geoJSON(activeAreaShape, {
        style: {
          color: '#3b82f6',
          weight: 2,
          opacity: 0.8,
          fillColor: '#3b82f6',
          fillOpacity: 0.1,
          dashArray: '5, 5'
        },
        pane: 'shapesPane'
      }).addTo(map);

      (map as any)._activeShapeLayer = shapeLayer;
    }

  }, [activeAreaShape]);

  return <div ref={mapRef} className="w-full h-full z-0 bg-slate-100" />;
};