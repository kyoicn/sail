import React, { useState, useEffect, useRef } from 'react';
import { EventData, MapBounds } from '@sail/shared';
import { PREDEFINED_REGIONS, HEATMAP_STYLES, DOT_STYLES, DotStyleConfig } from '../../lib/constants';
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
  expandedEventIds: Set<string>;
  onToggleExpand: (eventId: string) => void;
  zoomAction?: { type: 'in' | 'out', id: number } | null;
  interactionMode: 'exploration' | 'investigation' | 'playback';
  hoveredEventId: string | null;
  setHoveredEventId: (id: string | null) => void;
  activeAreaShape?: any | null; // GeoJSON MultiPolygon
  theme: 'light' | 'dark';
  // [NEW] Heatmap Props
  heatmapData: EventData[];
  showHeatmap: boolean;
  heatmapStyle?: string;
  showDots: boolean;
  dotStyle?: string;
  onEnterFocusMode?: (event: EventData) => void;
  focusStack?: string[];
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
  heatmapData,
  showHeatmap,
  heatmapStyle = 'classic',
  showDots,
  dotStyle = 'classic',
  onEnterFocusMode,
  focusStack = []
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layersMapRef = useRef<Map<string, { dot: any, card?: any, line?: any, shape?: any }>>(new Map());
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

    const { start, mid, end } = style.colors;

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
          console.log("🔥 Heatmap Library Loaded");
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

        const tileLayer = L.tileLayer(theme === 'dark'
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
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

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const tileLayer = (map as any)._tileLayer;

    if (tileLayer) {
      tileLayer.setUrl(theme === 'dark'
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      );
    }
  }, [theme]);


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
        layersMap.delete(eventId);
        return;
      }

      if (!shouldShowCard) {
        if (layerGroup.card) { layerGroup.card.remove(); delete layerGroup.card; }
        if (layerGroup.line) { layerGroup.line.remove(); delete layerGroup.line; }
        if (layerGroup.shape) { layerGroup.shape.remove(); delete layerGroup.shape; }
      }
    });

    eventsToRender.forEach(event => {
      const isExpanded = expandedEventIds.has(event.id);
      const isHovered = hoveredEventId === event.id;
      const shouldShowCard = isExpanded || isHovered;

      let layers = layersMap.get(event.id);

      const isFocused = focusStack.length > 0 && focusStack[focusStack.length - 1] === event.id;
      const isContainer = (event.children?.length ?? 0) > 0;

      let styleKey = dotStyle; // Current global theme as fallback
      if (isFocused) {
        styleKey = 'sunset';
      } else if (isContainer) {
        styleKey = 'volcano';
      } else {
        styleKey = 'classic';
      }

      const style = DOT_STYLES[styleKey] || DOT_STYLES['classic'];
      const dotColor = getDotColor(event.importance || 1, style);

      const span = viewRange.max - viewRange.min;
      const tTime = Math.max(0, Math.min(1, (span - 50) / (500 - 50)));
      const timeFactor = 1.5 - (tTime * 0.7);

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

      if (!layers) {
        const dotIcon = L.divIcon({ className: '', html: dotHtml, iconSize: [finalSize, finalSize], iconAnchor: [finalSize / 2, finalSize / 2] });
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
        // Identify if the style key itself changed for this specific marker
        const prevStyle = (layers.dot as any)._styleKey;
        const styleChanged = prevStyle !== styleKey;
        (layers.dot as any)._styleKey = styleKey;

        const needsVisualUpdate = spanDiff > 0.0001 || zoomDiff > 0.1 || styleChanged || prevVisualState.current.dotStyle !== dotStyle;

        if (needsVisualUpdate) {
          // [PATCH] Prevent redundant DOM updates if HTML content is identical
          // This fixes micro-flickering during timeline/map slides
          const currentIcon = layers.dot.getIcon();
          if (!currentIcon || currentIcon.options.html !== dotHtml) {
            const newIcon = L.divIcon({ className: '', html: dotHtml, iconSize: [finalSize, finalSize], iconAnchor: [finalSize / 2, finalSize / 2] });
            layers.dot.setIcon(newIcon);
          }
          layers.dot.setLatLng([event.location.lat, event.location.lng]);
          if (isFocused) layers.dot.setZIndexOffset(3000);
          else layers.dot.setZIndexOffset(2000);
        }
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
          if (event.title.includes('Container')) {
            console.log(`[FocusDebug] Event: ${event.title}`, {
              id: event.id,
              children: event.children,
              hasChildren,
              onEnterFocusMode: !!onEnterFocusMode
            });
          }
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
    });

    prevVisualState.current = {
      zoom: mapZoom,
      span: viewRange.max - viewRange.min,
      dotStyle: dotStyle
    };

  }, [currentDate, events, dynamicThreshold, jumpTargetId, mapZoom, expandedEventIds, interactionMode, viewRange.min, viewRange.max, hoveredEventId, showDots, dotStyle]);

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