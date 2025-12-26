'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { EventData, ChronosTime, ChronosLocation } from '@sail/shared';
import Link from 'next/link';
import { Download, Wand2, MapPin, Calendar, Globe, Type, ExternalLink, Trash2, Loader2, Plus, FileJson, Image as ImageIcon, Link as LinkIcon, X } from 'lucide-react';

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
  gemini: [
    'gemma-3-27b-it',
    'gemma-3-12b-it',
    'gemma-3-4b-it',
    'gemma-3-1b-it',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
  ],
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
          const bounds = L.latLngBounds(markers.map(e => [e.location.lat, e.location.lng]));
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

const TimeInput = ({ label, time, onChange, onRemove }: TimeInputProps) => (
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
            value={Math.abs(time.year)}
            onChange={e => {
              const val = parseInt(e.target.value);
              const year = isNaN(val) ? 0 : val;
              const isBce = time.year < 0;
              onChange('year', year * (isBce ? -1 : 1));
            }}
            className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-center text-gray-900 font-mono no-spin text-xs"
            placeholder="Year"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChange('year', time.year * -1);
            }}
            className="absolute right-1 top-1 text-[10px] text-gray-500 hover:text-blue-600 cursor-pointer font-bold bg-transparent border-0 p-0"
            title="Toggle Era"
          >
            {time.year < 0 ? 'BCE' : 'CE'}
          </button>
        </div>
        <select
          value={time.precision}
          onChange={e => onChange('precision', e.target.value)}
          className="w-1/3 bg-white border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
        >
          {['millennium', 'century', 'decade', 'year', 'month', 'day', 'hour', 'minute', 'second'].map(p => (
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

export default function ExtractorPage() {
  const [inputType, setInputType] = useState<'url' | 'text'>('url');
  const [content, setContent] = useState('');
  const [provider, setProvider] = useState<'ollama' | 'gemini'>('gemini');
  const [model, setModel] = useState(AVAILABLE_MODELS.gemini[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Layout state
  const [mapHeightPercent, setMapHeightPercent] = useState(70);
  const isDraggingRef = useRef(false);

  // Scroll to card when map marker clicked
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const handleScrollToCard = (id: string) => {
    setSelectedEventId(id);
    const el = cardRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

  // Auto-scroll logs
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleExtract = async () => {
    setIsProcessing(true);
    setLogs([]);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputType, content, provider, model }),
      });

      // Note: Streaming responses return 200 OK immediately when the connection is established.
      // Errors occurring mid-stream (like LLM failure) are sent as { type: 'error' } JSON chunks.
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
            setEvents(data.events || []);
          } else if (data.type === 'error') {
            // Explicit error from server - bubble up to main catch block
            throw new Error(data.message);
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setLogs(prev => [...prev, `Error: ${e.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnrich = async (specificEventId?: string, fields?: string[]) => {
    const targetEvents = specificEventId
      ? events.filter(e => e.id === specificEventId) :
      selectedEventId
        ? events.filter(e => e.id === selectedEventId)
        : events;

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
    }
  };



  const handleDownload = () => {
    const targetEvents = selectedEventId
      ? events.filter(e => e.id === selectedEventId)
      : events;

    if (targetEvents.length === 0) return;

    const formattedEvents = targetEvents.map(toEventSchema);

    const jsonString = JSON.stringify({ events: formattedEvents }, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `extracted_events_${targetEvents.length}_${new Date().toISOString()}.json`;
    link.click();
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
      images: e.imageUrl ? [{ label: 'Image', url: e.imageUrl }] : undefined,
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

            <button
              onClick={handleExtract}
              disabled={isProcessing || !content}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              Extract Events
            </button>
          </div>

          {/* Action Buttons Row */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-white gap-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{events.length} Events</div>
            <div className="flex gap-1">

              <button onClick={handleDownload} disabled={events.length === 0} title="Download JSON" className="p-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
                <Download className="w-4 h-4" />
              </button>

            </div>
          </div>

          {/* Event List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {events.map((event) => (
              <div
                key={event.id}
                ref={el => { cardRefs.current[event.id] = el }}
                className={`bg-white rounded-lg shadow-sm border p-3 transition-all ${selectedEventId === event.id ? 'ring-2 ring-blue-500 border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}
                onClick={() => setSelectedEventId(event.id)}
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
                  <div className="flex items-center justify-between gap-1 text-gray-500 mb-1">
                    <div className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" /> <span className="text-[10px] font-bold">IMAGES</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEnrich(event.id, ['image']); }}
                      disabled={isProcessing}
                      className="text-purple-600 hover:text-purple-800 disabled:opacity-50"
                      title="Find Images"
                    >
                      <Wand2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-400 italic text-center py-2">
                    No images found.
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
              events={events}
              onMarkerClick={handleScrollToCard}
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
              {isProcessing && <span className="text-green-400 animate-pulse">Running...</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-green-400">
              {logs.length === 0 && !isProcessing && <div className="text-gray-600 italic">Ready. Logs will appear here during extraction.</div>}
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap mb-0.5 border-l-2 border-transparent pl-1 ${log.startsWith('Error:') ? 'text-red-400 bg-red-900/10 border-red-500' : 'hover:border-gray-700'}`}
                >
                  {log}
                </div>
              ))}
              {isProcessing && <div className="animate-pulse">_</div>}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
