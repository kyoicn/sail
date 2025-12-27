'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { EventData, ChronosTime, ChronosLocation, geminiModels } from '@sail/shared';
import Link from 'next/link';
import { Download, Wand2, MapPin, Calendar, Globe, Type, ExternalLink, Trash2, Loader2, Plus, FileJson, Image as ImageIcon, Link as LinkIcon, X, CheckSquare, ChevronRight, ChevronDown, GitGraph, Network, RotateCcw, Upload, Trash } from 'lucide-react';

// CheckSquare import added below

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const AVAILABLE_MODELS = {
  ollama: [
    'deepseek-r1:8b',
    'deepseek-r1:70b',
    'deepseek-r1:7b',
    'deepseek-r1:1.5b',
    'qwen3:8b',
  ],
  gemini: Object.keys(geminiModels).filter(m => m !== 'default'),
};

// Dynamically import Map to avoid SSR issues with Leaflet
const MapWithNoSSR = dynamic(
  () => import('react-leaflet').then((mod) => {
    // We need to return a component that renders the map
    const { MapContainer, TileLayer, Marker, Popup, useMap } = mod;

    // Explicitly create an icon instance to avoid "iconUrl not set" errors
    const L = require('leaflet');

    // Define custom icon using CDN assets to avoid bundler issues
    const DefaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // Helper to fit bounds - component defined outside render loop to prevent unmount/remount
    const BoundsController = ({ markers }: { markers: EventData[] }) => {
      const map = useMap();
      useEffect(() => {
        if (markers.length > 0) {
          const bounds = L.latLngBounds(markers.map((e: EventData) => [e.location.lat, e.location.lng]));
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
        }
      }, [markers.length, map]);
      return null;
    };

    return ({ events, onMarkerClick, onMarkerDragEnd }: { events: EventData[], onMarkerClick: (id: string) => void, onMarkerDragEnd: (id: string, lat: number, lng: number) => void }) => {

      return (
        <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%', zIndex: 0 }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {events.map((event) => (
            event.location.lat !== 0 && (
              <Marker
                key={event.id}
                position={[event.location.lat, event.location.lng]}
                icon={DefaultIcon}
                draggable={true}
                eventHandlers={{
                  click: () => onMarkerClick(event.id),
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    onMarkerDragEnd(event.id, lat, lng);
                  }
                }}
              >
                <Popup>
                  <strong>{event.title}</strong><br />
                  {event.start.year}
                </Popup>
              </Marker>
            )
          ))}
          <BoundsController markers={events.filter(e => e.location.lat !== 0)} />
        </MapContainer>
      );
    };
  }),
  { ssr: false, loading: () => <div className="h-full w-full bg-gray-100 animate-pulse flex items-center justify-center">Loading Map...</div> }
);

interface TimeInputProps {
  label: string;
  time: ChronosTime;
  onChange: (field: string, value: any) => void;
  onRemove?: () => void;
}

const TimeInput = ({ label, time, onChange, onRemove }: TimeInputProps) => {
  if (!time) return null;
  const year = time.year ?? 0;

  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase">{label}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500" title="Remove End Time">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          <div className="w-2/3 relative">
            <input
              type="number"
              value={Math.abs(year)}
              onChange={e => {
                const val = parseInt(e.target.value);
                const newYear = isNaN(val) ? 0 : val;
                const isBce = year < 0;
                onChange('year', newYear * (isBce ? -1 : 1));
              }}
              className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 font-mono no-spin text-xs"
              placeholder="Year"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange('year', year * -1);
              }}
              className="absolute right-1 top-1 text-[10px] text-gray-500 hover:text-blue-600 cursor-pointer font-bold bg-transparent border-0 p-0"
              title="Toggle Era"
            >
              {year < 0 ? 'BCE' : 'CE'}
            </button>
          </div>
          <select
            value={time.precision || 'year'}
            onChange={e => onChange('precision', e.target.value)}
            className="w-1/3 bg-white border border-gray-200 rounded px-1 py-1 text-[10px] text-gray-900 outline-none"
          >
            {['millennium', 'century', 'decade', 'year', 'month', 'day', 'hour', 'minute', 'second', 'unknown'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <input type="number" placeholder="M" title="Month" value={time.month || ''} onChange={e => onChange('month', parseInt(e.target.value))} className="bg-white border border-gray-200 rounded px-1 py-1 text-center text-gray-900 text-xs no-spin" />
          <input type="number" placeholder="D" title="Day" value={time.day || ''} onChange={e => onChange('day', parseInt(e.target.value))} className="bg-white border border-gray-200 rounded px-1 py-1 text-center text-gray-900 text-xs no-spin" />
          <input type="number" placeholder="H" title="Hour" value={time.hour || ''} onChange={e => onChange('hour', parseInt(e.target.value))} className="bg-white border border-gray-200 rounded px-1 py-1 text-center text-gray-900 text-xs no-spin" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          <input type="number" placeholder="m" title="Minute" value={time.minute || ''} onChange={e => onChange('minute', parseInt(e.target.value))} className="bg-white border border-gray-200 rounded px-1 py-1 text-center text-gray-900 text-xs no-spin" />
          <input type="number" placeholder="s" title="Second" value={time.second || ''} onChange={e => onChange('second', parseInt(e.target.value))} className="bg-white border border-gray-200 rounded px-1 py-1 text-center text-gray-900 text-xs no-spin" />
          <input type="number" placeholder="ms" title="Millisecond" value={time.millisecond || ''} onChange={e => onChange('millisecond', parseInt(e.target.value))} className="bg-white border border-gray-200 rounded px-1 py-1 text-center text-gray-900 text-xs no-spin" />
        </div>
      </div>
    </div>
  );
};

export default function ExtractorPage() {
  const [inputType, setInputType] = useState<'url' | 'text'>('url');
  const [content, setContent] = useState('');
  const [provider, setProvider] = useState<'ollama' | 'gemini'>('gemini');
  const [model, setModel] = useState(AVAILABLE_MODELS.gemini[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [isEventListExpanded, setIsEventListExpanded] = useState(false);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [elapsedTime, setElapsedTime] = useState(0);

  // Layout state
  const [mapHeightPercent, setMapHeightPercent] = useState(70);
  const isDraggingRef = useRef(false);

  // Scroll to card
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const handleMarkerClick = (id: string) => {
    // When clicking a marker on the map, select only that event and scroll to it
    setSelectedEventIds(new Set([id]));
    const el = cardRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCardClick = (e: React.MouseEvent, id: string) => {
    // Prevent selection toggle if interacting with form elements
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A', 'svg', 'path'].includes(target.tagName) || target.closest('button') || target.closest('a')) {
      return;
    }

    // Toggle selection (always multi-select behavior)
    setSelectedEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Resize Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel) return;

    const rect = rightPanel.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const newPercent = (relativeY / rect.height) * 100;

    // Clamp between 20% and 80%
    if (newPercent > 20 && newPercent < 80) {
      setMapHeightPercent(newPercent);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-scroll logs
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleExtract = async () => {
    const startTime = Date.now();
    setIsProcessing(true);
    setLogs([]);
    let lastFetchedEvents: EventData[] = [];
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputType, content, provider, model }),
      });

      // Note: Streaming responses return 200 OK immediately when the connection is established.
      // Errors occurring mid-stream (like LLM failure) are sent as {type: 'error' } JSON chunks.
      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let data;
          try {
            data = JSON.parse(line);
          } catch (parseErr) {
            console.error('Frontend failed to parse NDJSON line:', line, parseErr);
            // Don't kill the stream for a single bad line, just log it
            continue;
          }

          if (data.type === 'log') {
            setLogs(prev => [...prev, data.message]);
          } else if (data.type === 'result') {
            let fetchedEvents = data.events || [];
            // If extracted from URL, add it as a source, avoiding duplicates
            if (inputType === 'url' && content.trim()) {
              const urlToAdd = content.trim();
              fetchedEvents = fetchedEvents.map((e: EventData) => {
                const existingSources = e.sources || [];
                // Remove any source that matches the URL we are about to add
                const filteredSources = existingSources.filter(s => s.url.trim() !== urlToAdd);
                return {
                  ...e,
                  sources: [
                    ...filteredSources,
                    { label: 'Source web page', url: urlToAdd }
                  ]
                };
              });
            }
            setEvents(prev => [...prev, ...fetchedEvents]);
            lastFetchedEvents = fetchedEvents;
          } else if (data.type === 'error') {
            // Explicit error from server - bubble up to main catch block
            throw new Error(data.message);
          }
        }
      }

      if (autoEnrich && lastFetchedEvents.length > 0) {
        setLogs(prev => [...prev, "--- Automatic Enrichment Started ---"]);
        await handleEnrich(undefined, undefined, lastFetchedEvents);
      }
    } catch (e: any) {
      console.error(e);
      setLogs(prev => [...prev, `Error: ${e.message}`]);
    } finally {
      setIsProcessing(false);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      setLogs(prev => [...prev, `✓ Extraction completed in ${duration}s.`]);
    }
  };

  const handleRemoveAll = () => {
    if (confirm('Are you sure you want to remove all events from the list?')) {
      setEvents([]);
      setSelectedEventIds(new Set());
      setCollapsedParents(new Set());
      setLogs(prev => [...prev, '--- All events cleared ---']);
    }
  };

  const handleLoadJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonContent = event.target?.result as string;
        const json = JSON.parse(jsonContent);
        const eventsToLoad = Array.isArray(json) ? json : (json.events || []);

        if (!Array.isArray(eventsToLoad)) {
          throw new Error('Invalid JSON format: expected an array of events or an object with an "events" array.');
        }

        // Generate new internal IDs and normalize structures for format compatibility
        const newEvents = eventsToLoad.map((e: any) => {
          // Normalize Location
          const rawLoc = e.location || {};
          const normalizedLoc = {
            lat: rawLoc.lat ?? rawLoc.latitude ?? 0,
            lng: rawLoc.lng ?? rawLoc.longitude ?? 0,
            placeName: rawLoc.placeName ?? rawLoc.location_name ?? '',
            granularity: rawLoc.granularity ?? rawLoc.precision ?? 'spot',
            certainty: rawLoc.certainty ?? 'unknown'
          };

          // Normalize Time
          const rawStart = e.start || e.start_time || { year: 0 };
          const startYear = rawStart.year ?? 0;
          const normalizedStart = {
            ...rawStart,
            year: startYear,
            precision: rawStart.precision || 'year',
            astro_year: rawStart.astro_year ?? (startYear > 0 ? startYear : startYear + 1)
          };

          const rawEnd = e.end || e.end_time;
          let normalizedEnd = undefined;
          if (rawEnd && (rawEnd.year !== undefined || rawEnd.astro_year !== undefined)) {
            const endYear = rawEnd.year ?? 0;
            normalizedEnd = {
              ...rawEnd,
              year: endYear,
              precision: rawEnd.precision || 'year',
              astro_year: rawEnd.astro_year ?? (endYear > 0 ? endYear : endYear + 1)
            };
          }

          return {
            ...e,
            id: crypto.randomUUID(),
            start: normalizedStart,
            end: normalizedEnd,
            location: normalizedLoc
          };
        });

        setEvents(prev => [...prev, ...newEvents]);
        setLogs(prev => [...prev, `✓ Loaded ${newEvents.length} events from ${file.name}.`]);
      } catch (err: any) {
        console.error('Failed to load JSON:', err);
        setLogs(prev => [...prev, `Error loading JSON: ${err.message}`]);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEnrich = async (specificEventId?: string, fields?: string[], manualEvents?: EventData[]) => {
    const startTime = Date.now();
    let targetEvents = manualEvents;

    if (!targetEvents) {
      targetEvents = specificEventId
        ? events.filter(e => e.id === specificEventId) :
        selectedEventIds.size > 0
          ? events.filter(e => selectedEventIds.has(e.id))
          : events;
    }

    if (targetEvents.length === 0) return;

    setIsProcessing(true);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: targetEvents, provider, model, context: content, fields }),
      });

      if (!res.ok) throw new Error(await res.text());
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let data;
          try {
            data = JSON.parse(line);
          } catch (parseErr) {
            console.error('Frontend failed to parse NDJSON line:', line, parseErr);
            continue;
          }

          if (data.type === 'log') {
            setLogs(prev => [...prev, data.message]);
          } else if (data.type === 'result') {
            // Merge enriched events back
            const newEvents = data.events as EventData[];
            const enrichedMap = new Map((newEvents || []).map((e) => [e.id, e]));
            setEvents(prev => prev.map(e => enrichedMap.get(e.id) || e));
            setLogs(prev => [...prev, `Enriched ${newEvents.length} events successfully.`]);
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setLogs(prev => [...prev, `Enrichment Failed: ${e.message}`]);
    } finally {
      setIsProcessing(false);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      setLogs(prev => [...prev, `✓ Enrichment completed in ${duration}s.`]);
    }
  };

  const handleCluster = async () => {
    const startTime = Date.now();
    const targetEvents = selectedEventIds.size > 0
      ? events.filter(e => selectedEventIds.has(e.id))
      : events;

    if (targetEvents.length === 0) {
      setLogs(prev => [...prev, "No events to cluster."]);
      return;
    }

    setIsProcessing(true);
    setLogs(prev => [...prev, "--- Clustering Started ---"]);

    try {
      const res = await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: targetEvents, provider, model }),
      });

      if (!res.ok) throw new Error(await res.text());
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let data;
          try {
            data = JSON.parse(line);
          } catch (parseErr) {
            console.error('Frontend parsing error:', line, parseErr);
            continue;
          }

          if (data.type === 'log') {
            setLogs(prev => [...prev, data.message]);
          } else if (data.type === 'thought') {
            setLogs(prev => [...prev, `Thinking: ${data.message}`]);
          } else if (data.type === 'result') {
            const relationships = data.relationships as { child_id: string, parent_id: string }[];
            const relationshipMap = new Map(relationships.map(r => [r.child_id, r.parent_id]));

            setEvents(prev => {
              const nextEvents = prev.map(e => ({
                ...e,
                parent_source_id: undefined as string | undefined,
                children: [] as string[]
              }));

              const eventMapLocal = new Map(nextEvents.map(e => [e.id, e]));

              relationships.forEach(r => {
                const child = eventMapLocal.get(r.child_id);
                const parent = eventMapLocal.get(r.parent_id);

                if (child && parent) {
                  child.parent_source_id = parent.id;
                  parent.children = parent.children || [];
                  if (!parent.children.includes(child.id)) {
                    parent.children.push(child.id);
                  }
                }
              });

              return [...nextEvents];
            });
            setLogs(prev => [...prev, `Clustered ${relationships.length} relationships.`]);
          } else if (data.type === 'error') {
            throw new Error(data.message);
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setLogs(prev => [...prev, `Clustering Failed: ${e.message}`]);
    } finally {
      setIsProcessing(false);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      setLogs(prev => [...prev, `✓ Clustering completed in ${duration}s.`]);
    }
  };

  const handleClearClusters = () => {
    setEvents(prev => prev.map(e => ({
      ...e,
      parent_source_id: undefined,
      children: []
    })));
    setCollapsedParents(new Set());
    setLogs(prev => [...prev, "Cleared all clustering relationships."]);
  };

  const toggleParentCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };




  const handleSelectAll = () => {
    if (events.length === 0) return;

    // specific behavior: if all selected -> deselect all. Otherwise -> select all
    const allSelected = events.every(e => selectedEventIds.has(e.id));

    if (allSelected) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(events.map(e => e.id)));
    }
  };

  const handleDownload = async () => {
    const targetEvents = selectedEventIds.size > 0
      ? events.filter(e => selectedEventIds.has(e.id))
      : events;

    if (targetEvents.length === 0) return;

    const formattedEvents = targetEvents.map(toEventSchema);
    const jsonString = JSON.stringify({ events: formattedEvents }, null, 2);
    // Use hyphenated ISO string for valid filename across OSs
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `extracted_events_${targetEvents.length}_${dateStr}.json`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        setLogs(prev => [...prev, `✓ Events saved to ${handle.name}`]);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Save File Error:', err);
          setLogs(prev => [...prev, `Error saving file: ${err.message}`]);
        }
      }
    } else {
      // Fallback for non-supported browsers
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setLogs(prev => [...prev, `✓ Download triggered for ${fileName}`]);

      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
  };

  const updateEvent = (id: string, field: keyof EventData | string, value: any) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;

      // Handle nested updates (start.year, location.lat etc)
      // Simple dot notation handler for 1 level deep
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        return {
          ...e,
          [parent]: {
            ...(e as any)[parent],
            [child]: value
          }
        };
      }
      return { ...e, [field]: value };
    }));
  };

  const removeEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    if (selectedEventIds.has(id)) {
      setSelectedEventIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toEventSchema = (e: EventData) => {
    const formatTime = (t: any) => {
      if (!t) return undefined;
      const { astro_year, millisecond, ...rest } = t;
      const res = { ...rest };
      if (millisecond && millisecond !== 0) {
        res.millisecond = millisecond;
      }
      return res;
    };

    const eventMapLocal = new Map(events.map(ev => [ev.id, ev]));

    return {
      source_id: e.source_id,
      title: e.title,
      summary: e.summary,
      importance: e.importance,
      start_time: formatTime(e.start),
      end_time: formatTime(e.end),
      location: {
        latitude: e.location.lat,
        longitude: e.location.lng,
        location_name: e.location.placeName,
        precision: e.location.granularity,
        certainty: e.location.certainty
      },
      sources: e.sources,
      images: e.images && e.images.length > 0 ? e.images : (e.imageUrl ? [{ label: 'Image', url: e.imageUrl }] : undefined),
      parent_source_id: e.parent_source_id ? (eventMapLocal.get(e.parent_source_id)?.source_id || e.parent_source_id) : undefined,
      children: e.children?.map(cid => eventMapLocal.get(cid)?.source_id).filter(Boolean) as string[],
    };
  };

  const handleShowJson = (event: EventData) => {
    setLogs(prev => [...prev, `JSON for "${event.title}":`, JSON.stringify(toEventSchema(event), null, 2)]);
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header - simplified */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
            ← Back
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Event Extractor & Enricher</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Column: 30% */}
        <div className="w-[30%] min-w-[350px] flex flex-col border-r border-gray-200 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">

          {/* Input Section */}
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            {/* Top Row: Tabs + API Controls */}
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex bg-gray-200/50 p-1 rounded-lg">
                <button
                  onClick={() => setInputType('url')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${inputType === 'url' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  URL
                </button>
                <button
                  onClick={() => setInputType('text')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${inputType === 'text' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Text
                </button>
              </div>

              {/* API Controls moved here */}
              <div className="flex items-center gap-2 flex-1 justify-end">
                <select
                  value={provider}
                  onChange={e => {
                    const newProvider = e.target.value as 'ollama' | 'gemini';
                    setProvider(newProvider);
                    // Reset model or set default when provider changes
                    setModel(AVAILABLE_MODELS[newProvider][0]);
                  }}
                  className="border border-gray-300 rounded-md text-xs px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white max-w-[100px]"
                >
                  <option value="ollama">Ollama</option>
                  <option value="gemini">Gemini</option>
                </select>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="border border-gray-300 rounded-md text-xs px-2 py-1.5 focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white max-w-[150px]"
                >
                  {AVAILABLE_MODELS[provider].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Input Area */}
            <div className="flex gap-2 mb-3">
              {inputType === 'url' ? (
                <input
                  type="url"
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 bg-white shadow-sm"
                  placeholder="https://..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              ) : (
                <textarea
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 h-20 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none text-gray-900 bg-white shadow-sm"
                  placeholder="Paste text..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExtract}
                disabled={isProcessing || !content}
                className="flex-1 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                {isProcessing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                Extract
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  id="auto-enrich"
                  checked={autoEnrich}
                  onChange={e => setAutoEnrich(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="auto-enrich" className="text-[11px] font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap">
                  Auto-Enrich
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="border-b border-gray-200 bg-white">
            <div className="px-4 py-3 flex items-center justify-between gap-2">
              <button
                onClick={() => setIsEventListExpanded(!isEventListExpanded)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
              >
                <ChevronRight className={`w-3 h-3 transition-transform ${isEventListExpanded ? 'rotate-90' : ''}`} />
                {events.length} Events
              </button>
              <div className="flex gap-1 items-center">
                <button
                  onClick={handleClearClusters}
                  disabled={isProcessing || events.length === 0}
                  title="Clear Clustering Results"
                  className="p-2 border border-gray-200 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <button
                  onClick={handleCluster}
                  disabled={isProcessing || events.length === 0}
                  title="Cluster Events (Parent-Child)"
                  className="p-2 border border-purple-200 text-purple-700 rounded hover:bg-purple-50 disabled:opacity-50 transition-colors"
                >
                  <Network className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSelectAll}
                  disabled={events.length === 0}
                  title={events.length > 0 && events.every(e => selectedEventIds.has(e.id)) ? "Deselect All" : "Select All"}
                  className="p-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                </button>

                <button
                  onClick={handleRemoveAll}
                  disabled={events.length === 0}
                  title="Remove All Events"
                  className="p-2 border border-red-200 text-red-500 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="h-4 w-px bg-gray-200 mx-1" />

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleLoadJSON}
                  accept=".json"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Load JSON from Disk"
                  className="p-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                </button>

                <button onClick={handleDownload} disabled={events.length === 0} title="Download JSON" className="p-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expandable Mini List */}
            {isEventListExpanded && events.length > 0 && (
              <div className="max-h-64 overflow-y-auto border-t border-gray-100 bg-gray-50/50 py-2">
                {(() => {
                  const childrenMap = new Map<string, EventData[]>();
                  const roots: EventData[] = [];
                  const eventMap = new Map(events.map(e => [e.id, e]));

                  events.forEach(e => {
                    if (e.parent_source_id && eventMap.has(e.parent_source_id)) {
                      const children = childrenMap.get(e.parent_source_id) || [];
                      children.push(e);
                      childrenMap.set(e.parent_source_id, children);
                    } else {
                      roots.push(e);
                    }
                  });

                  const renderEvent = (event: EventData, depth: number = 0) => {
                    const children = childrenMap.get(event.id) || [];
                    const isCollapsed = collapsedParents.has(event.id);
                    const isSelected = selectedEventIds.has(event.id);

                    return (
                      <div key={event.id}>
                        <div
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey) {
                              handleCardClick(e, event.id);
                            } else {
                              handleMarkerClick(event.id);
                            }
                          }}
                          className={`px-4 py-1.5 text-xs text-gray-600 hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2 group ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : ''}`}
                          style={{ paddingLeft: `${16 + depth * 16}px` }}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {children.length > 0 ? (
                              <button
                                onClick={(e) => toggleParentCollapse(event.id, e)}
                                className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                              >
                                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            ) : (
                              <div className="w-4 h-4" />
                            )}
                            <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-gray-300'}`} />
                            <span className="truncate">{event.title || 'Untitled Event'}</span>
                            {event.parent_source_id && !eventMap.has(event.parent_source_id) && (
                              <span className="text-[10px] bg-gray-100 px-1 rounded text-gray-400">Child</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowJson(event);
                              }}
                              title="Show JSON"
                              className="p-1 text-gray-400 hover:text-blue-500 hover:bg-white rounded transition-colors"
                            >
                              <FileJson className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeEvent(event.id);
                              }}
                              title="Delete Event"
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-white rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {!isCollapsed && children.length > 0 && (
                          <div className="border-l border-gray-100">
                            {children.map(child => renderEvent(child, depth + 1))}
                          </div>
                        )}
                      </div>
                    );
                  };

                  return roots.map(root => renderEvent(root));
                })()}
              </div>
            )}
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {events.map((event) => (
              <div
                key={event.id}
                ref={el => { cardRefs.current[event.id] = el }}
                className={`bg-white rounded-lg shadow-sm border p-3 transition-all ${selectedEventIds.has(event.id) ? 'ring-2 ring-blue-500 border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}
                onClick={(e) => handleCardClick(e, event.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 mr-2">
                    <input
                      value={event.title}
                      onChange={e => updateEvent(event.id, 'title', e.target.value)}
                      className="w-full font-semibold text-sm text-gray-900 border-b border-transparent focus:border-blue-500 outline-none bg-transparent"
                      placeholder="Event Title"
                    />
                    <input
                      value={event.source_id || ''}
                      onChange={e => updateEvent(event.id, 'source_id', e.target.value)}
                      className="w-full text-[10px] text-gray-500 border-b border-transparent focus:border-blue-500 outline-none bg-transparent font-mono mt-0.5"
                      placeholder="Source ID"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShowJson(event);
                      }}
                      title="Show JSON"
                      className="text-gray-400 hover:text-blue-500 transition-colors"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeEvent(event.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-1 mt-2">
                  <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                    <Type className="w-3 h-3" /> SUMMARY
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEnrich(event.id, ['summary']); }}
                    disabled={isProcessing}
                    className="text-purple-600 hover:text-purple-800 disabled:opacity-50"
                    title="Enrich Summary"
                  >
                    <Wand2 className="w-3 h-3" />
                  </button>
                </div>
                <textarea
                  value={event.summary}
                  onChange={e => updateEvent(event.id, 'summary', e.target.value)}
                  className="w-full text-xs text-gray-600 border border-gray-100 rounded p-1.5 focus:border-blue-500 outline-none h-14 resize-none mb-2 bg-gray-50 focus:bg-white transition-colors"
                  placeholder="Summary..."
                />

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                    <div className="flex items-center justify-between gap-1 text-gray-500 mb-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> <span className="text-[10px] font-bold">TIME</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEnrich(event.id, ['time']); }}
                        disabled={isProcessing}
                        className="text-purple-600 hover:text-purple-800 disabled:opacity-50"
                        title="Enrich Time"
                      >
                        <Wand2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-1">
                      <TimeInput
                        label="Start"
                        time={event.start}
                        onChange={(field, value) => updateEvent(event.id, `start.${field}`, value)}
                      />

                      {event.end ? (
                        <TimeInput
                          label="End"
                          time={event.end}
                          onChange={(field, value) => updateEvent(event.id, `end.${field}`, value)}
                          onRemove={() => updateEvent(event.id, 'end', undefined)}
                        />
                      ) : (
                        <button
                          onClick={() => updateEvent(event.id, 'end', { ...event.start, precision: event.start.precision })}
                          className="w-full py-1 text-[10px] text-blue-500 border border-dashed border-blue-200 hover:bg-blue-50 rounded flex items-center justify-center gap-1 mt-1"
                        >
                          <Plus className="w-3 h-3" /> Add End Time
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                    <div className="flex items-center justify-between gap-1 text-gray-500 mb-1">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> <span className="text-[10px] font-bold">LOC</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEnrich(event.id, ['location']); }}
                        disabled={isProcessing}
                        className="text-purple-600 hover:text-purple-800 disabled:opacity-50"
                        title="Enrich Location"
                      >
                        <Wand2 className="w-3 h-3" />
                      </button>
                    </div>
                    <input
                      value={event.location.placeName || ''}
                      onChange={e => updateEvent(event.id, 'location.placeName', e.target.value)}
                      placeholder="Place"
                      className="w-full bg-white border border-gray-200 rounded px-2 py-1 mb-1 text-gray-900 truncate text-xs"
                    />
                    <div className="flex gap-1 mb-1">
                      <input
                        value={event.location.lat ? event.location.lat.toFixed(2) : ''}
                        readOnly
                        className="w-1/2 bg-gray-100 border border-transparent rounded px-2 py-1 text-center text-gray-500 text-xs"
                      />
                      <input
                        value={event.location.lng ? event.location.lng.toFixed(2) : ''}
                        readOnly
                        className="w-1/2 bg-gray-100 border border-transparent rounded px-2 py-1 text-center text-gray-500 text-xs"
                      />
                    </div>
                    <div className="flex gap-1">
                      <select
                        value={event.location.granularity || 'unknown'}
                        onChange={e => updateEvent(event.id, 'location.granularity', e.target.value)}
                        className="w-1/2 bg-white border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                      >
                        {['spot', 'area', 'unknown'].map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <select
                        value={event.location.certainty || 'unknown'}
                        onChange={e => updateEvent(event.id, 'location.certainty', e.target.value)}
                        className="w-1/2 bg-white border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                      >
                        {['definite', 'approximate', 'unknown'].map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Images Section */}
                <div className="bg-gray-50 p-1.5 rounded border border-gray-100 text-xs">
                  <div className="flex items-center justify-between gap-1 text-gray-500 mb-2">
                    <div className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> <span className="text-[10px] font-bold">IMAGES ({event.images?.length || (event.imageUrl ? 1 : 0)})</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEnrich(event.id, ['image']); }}
                      disabled={isProcessing}
                      className="text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      title="Find More Images"
                    >
                      <Wand2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {/* Primary Image Preview (if exists) */}
                    {(event.images || (event.imageUrl ? [{ label: 'Primary', url: event.imageUrl }] : [])).map((img: any, idx: number) => (
                      <div key={idx} className="space-y-1">
                        <div className="relative group/img aspect-video rounded overflow-hidden border border-gray-200 bg-white">
                          <img
                            src={img.url}
                            alt={img.label || event.title}
                            className="w-full h-full object-cover"
                            onError={() => {
                              console.warn(`Removing invalid image for ${event.title}: ${img.url}`);
                              const baseImgs = event.images || (event.imageUrl ? [{ label: 'Primary', url: event.imageUrl }] : []);
                              const newImages = baseImgs.filter((_: any, i: number) => i !== idx);
                              updateEvent(event.id, 'images', newImages);
                              if (idx === 0) {
                                updateEvent(event.id, 'imageUrl', newImages[0]?.url);
                              }
                            }}
                          />
                          <button
                            onClick={() => {
                              const baseImgs = event.images || (event.imageUrl ? [{ label: 'Primary', url: event.imageUrl }] : []);
                              const newImages = baseImgs.filter((_: any, i: number) => i !== idx);
                              updateEvent(event.id, 'images', newImages);
                              // Sync legacy imageUrl if first image changed
                              if (idx === 0) {
                                updateEvent(event.id, 'imageUrl', newImages[0]?.url);
                              }
                            }}
                            className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <input
                            value={img.label || ''}
                            onChange={e => {
                              const baseImgs = event.images || (event.imageUrl ? [{ label: 'Primary', url: event.imageUrl }] : []);
                              const imgs = [...baseImgs];
                              imgs[idx] = { ...imgs[idx], label: e.target.value };
                              updateEvent(event.id, 'images', imgs);
                            }}
                            placeholder="Label"
                            className="w-1/3 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-900 text-[10px]"
                          />
                          <input
                            value={img.url}
                            onChange={e => {
                              const baseImgs = event.images || (event.imageUrl ? [{ label: 'Primary', url: event.imageUrl }] : []);
                              const imgs = [...baseImgs];
                              imgs[idx] = { ...imgs[idx], url: e.target.value };
                              updateEvent(event.id, 'images', imgs);
                              if (idx === 0) updateEvent(event.id, 'imageUrl', e.target.value);
                            }}
                            placeholder="Image URL"
                            className="flex-1 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-900 text-[10px] truncate"
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => {
                        const baseImgs = event.images || (event.imageUrl ? [{ label: 'Primary', url: event.imageUrl }] : []);
                        const imgs = [...baseImgs];
                        imgs.push({ label: '', url: '' });
                        updateEvent(event.id, 'images', imgs);
                      }}
                      className="w-full py-1 text-[10px] text-blue-500 border border-dashed border-blue-200 hover:bg-blue-50 rounded flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Image
                    </button>

                    {!(event.images?.length || event.imageUrl) && (
                      <div className="text-[10px] text-gray-400 italic text-center py-2 border border-dashed border-gray-200 rounded">
                        No images found.
                      </div>
                    )}
                  </div>
                </div>

                {/* Sources Section */}
                <div className="bg-gray-50 p-1.5 rounded border border-gray-100 text-xs mt-2">
                  <div className="flex items-center justify-between gap-1 text-gray-500 mb-1">
                    <div className="flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> <span className="text-[10px] font-bold">SOURCES</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {(event.sources || []).map((source, idx) => (
                      <div key={idx} className="flex gap-1 items-center">
                        <input
                          value={source.label || ''}
                          onChange={e => {
                            const newSources = [...(event.sources || [])];
                            newSources[idx] = { ...newSources[idx], label: e.target.value };
                            updateEvent(event.id, 'sources', newSources);
                          }}
                          className="w-1/3 bg-white border border-gray-200 rounded px-1.5 py-1 text-gray-900 text-xs"
                          placeholder="Label"
                        />
                        <input
                          value={source.url || ''}
                          onChange={e => {
                            const newSources = [...(event.sources || [])];
                            newSources[idx] = { ...newSources[idx], url: e.target.value };
                            updateEvent(event.id, 'sources', newSources);
                          }}
                          className="flex-1 bg-white border border-gray-200 rounded px-1.5 py-1 text-gray-900 text-xs text-blue-500 underline"
                          placeholder="URL"
                        />
                        <button
                          onClick={() => {
                            const newSources = (event.sources || []).filter((_, i) => i !== idx);
                            updateEvent(event.id, 'sources', newSources);
                          }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateEvent(event.id, 'sources', [...(event.sources || []), { label: '', url: '' }])}
                      className="w-full py-1 text-[10px] text-blue-500 border border-dashed border-blue-200 hover:bg-blue-50 rounded flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Source
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {events.length === 0 && !isProcessing && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <p className="text-xs">No events yet.</p>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: 70% - Resizable Split View */}
        <div id="right-panel" className="flex-1 flex flex-col bg-gray-200 relative h-full">

          {/* Top: Map */}
          <div style={{ height: `${mapHeightPercent}%` }} className="relative bg-white w-full">
            <MapWithNoSSR
              events={selectedEventIds.size > 0 ? events.filter(e => selectedEventIds.has(e.id)) : []}
              onMarkerClick={handleMarkerClick}
              onMarkerDragEnd={(id, lat, lng) => {
                updateEvent(id, 'location.lat', lat);
                updateEvent(id, 'location.lng', lng);
              }}
            />

            {/* Simple Map Legend */}
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded shadow-sm text-[10px] z-[1000] border border-gray-200">
              <div className="flex gap-2 items-center">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="font-medium text-gray-700">Identified Location</span>
              </div>
            </div>
          </div>

          {/* Draggable Divider */}
          <div
            onMouseDown={handleMouseDown}
            className="h-1.5 bg-gray-100 border-y border-gray-300 hover:bg-blue-100 cursor-ns-resize flex items-center justify-center z-20 shrink-0 transition-colors"
          >
            <div className="w-8 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Bottom: Logs */}
          <div className="flex-1 bg-gray-900 flex flex-col min-h-0">
            <div className="px-3 py-1 bg-gray-800 border-b border-gray-700 text-[10px] font-mono text-gray-400 uppercase tracking-widest flex justify-between items-center">
              <span>Processing Console</span>
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <span className="text-green-400 animate-pulse">Running...</span>
                  <span className="text-blue-400 font-bold drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]">({formatTime(elapsedTime)})</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-green-400">
              {logs.length === 0 && !isProcessing && <div className="text-gray-600 italic">Ready. Logs will appear here during extraction.</div>}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap mb-0.5 border-l-2 border-transparent pl-1 
                    ${log.startsWith('Error:') ? 'text-red-400 bg-red-900/10 border-red-500' :
                      log.startsWith('Thinking:') ? 'text-purple-300 italic opacity-80' :
                        'hover:border-gray-700'}`}
                >
                  {log}
                </div>
              ))}
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <span className="animate-pulse">_</span>
                  <span className="text-gray-600 text-[10px] tracking-tighter">[{formatTime(elapsedTime)}]</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
