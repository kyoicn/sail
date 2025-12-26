'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { EventData, ChronosTime, ChronosLocation } from '@sail/shared';
import Link from 'next/link';
import { Download, Save, Wand2, MapPin, Calendar, Globe, Type, ExternalLink, Trash2, Loader2, Plus } from 'lucide-react';

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

    return ({ events, onMarkerClick }: { events: EventData[], onMarkerClick: (id: string) => void }) => {
      // Helper to fit bounds
      const BoundsController = ({ markers }: { markers: EventData[] }) => {
        const map = useMap();
        useEffect(() => {
          if (markers.length > 0) {
            const bounds = L.latLngBounds(markers.map(e => [e.location.lat, e.location.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
          }
        }, [markers, map]);
        return null;
      };

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
                eventHandlers={{ click: () => onMarkerClick(event.id) }}
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

  const handleEnrich = async () => {
    const targetEvents = selectedEventId
      ? events.filter(e => e.id === selectedEventId)
      : events;

    if (targetEvents.length === 0) return;

    setIsProcessing(true);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: targetEvents, provider, model, context: content }),
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

  const handleSubmit = async () => {
    const targetEvents = selectedEventId
      ? events.filter(e => e.id === selectedEventId)
      : events;

    if (targetEvents.length === 0) return;

    if (!confirm(`Submit ${targetEvents.length} events to the database?`)) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/events/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: targetEvents, dataset: 'dev' }), // Defaulting to dev
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLogs(prev => [...prev, `Successfully saved ${data.count} events!`]);
    } catch (e: any) {
      console.error(e);
      setLogs(prev => [...prev, `Submission Failed: ${e.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    const targetEvents = selectedEventId
      ? events.filter(e => e.id === selectedEventId)
      : events;

    if (targetEvents.length === 0) return;

    const jsonString = JSON.stringify({ events: targetEvents }, null, 2);
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
              <button onClick={handleEnrich} disabled={isProcessing || events.length === 0} title="Enrich" className="p-2 border border-purple-200 text-purple-700 bg-purple-50 rounded hover:bg-purple-100 disabled:opacity-50">
                <Wand2 className="w-4 h-4" />
              </button>
              <button onClick={handleDownload} disabled={events.length === 0} title="Download JSON" className="p-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={handleSubmit} disabled={isProcessing || events.length === 0} title="Save to DB" className="p-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                <Save className="w-4 h-4" />
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
                  </div>
                  <button onClick={() => removeEvent(event.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <textarea
                  value={event.summary}
                  onChange={e => updateEvent(event.id, 'summary', e.target.value)}
                  className="w-full text-xs text-gray-600 border border-gray-100 rounded p-1.5 focus:border-blue-500 outline-none h-14 resize-none mb-2 bg-gray-50 focus:bg-white transition-colors"
                  placeholder="Summary..."
                />

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                    <div className="flex items-center gap-1 text-gray-500 mb-1">
                      <Calendar className="w-3 h-3" /> <span className="text-[10px] font-bold">TIME</span>
                    </div>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={event.start.year}
                        onChange={e => updateEvent(event.id, 'start.year', parseInt(e.target.value))}
                        className="w-1/2 bg-white border border-gray-200 rounded px-1 text-center text-gray-900"
                        placeholder="Year"
                      />
                      <select
                        value={event.start.precision}
                        onChange={e => updateEvent(event.id, 'start.precision', e.target.value)}
                        className="w-1/2 bg-white border border-gray-200 rounded px-1 text-[9px] text-gray-900"
                      >
                        {['year', 'month', 'day'].map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-1.5 rounded border border-gray-100">
                    <div className="flex items-center gap-1 text-gray-500 mb-1">
                      <MapPin className="w-3 h-3" /> <span className="text-[10px] font-bold">LOC</span>
                    </div>
                    <input
                      value={event.location.placeName || ''}
                      onChange={e => updateEvent(event.id, 'location.placeName', e.target.value)}
                      placeholder="Place"
                      className="w-full bg-white border border-gray-200 rounded px-1 mb-1 text-gray-900 truncate"
                    />
                    <div className="flex gap-1">
                      <input
                        value={event.location.lat ? event.location.lat.toFixed(2) : ''}
                        readOnly
                        className="w-1/2 bg-gray-100 border border-transparent rounded px-1 text-center text-gray-500"
                      />
                      <input
                        value={event.location.lng ? event.location.lng.toFixed(2) : ''}
                        readOnly
                        className="w-1/2 bg-gray-100 border border-transparent rounded px-1 text-center text-gray-500"
                      />
                    </div>
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
            <MapWithNoSSR events={events} onMarkerClick={handleScrollToCard} />

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
