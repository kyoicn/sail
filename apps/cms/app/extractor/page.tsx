'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { EventData, ChronosTime, ChronosLocation } from '@sail/shared';
import Link from 'next/link';
import { Download, Save, Wand2, MapPin, Calendar, Globe, Type, ExternalLink, Trash2, Loader2, Plus } from 'lucide-react';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Dynamically import Map to avoid SSR issues with Leaflet
const MapWithNoSSR = dynamic(
  () => import('react-leaflet').then((mod) => {
    // We need to return a component that renders the map
    const { MapContainer, TileLayer, Marker, Popup, useMap } = mod;

    // Fix for default marker icons
    // CSS imported globally in globals.css now
    const L = require('leaflet');
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: markerIcon2x.src,
      iconUrl: markerIcon.src,
      shadowUrl: markerShadow.src,
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
  const [provider, setProvider] = useState<'ollama' | 'gemini'>('ollama');
  const [model, setModel] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Scroll to card when map marker clicked
  const cardRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const handleScrollToCard = (id: string) => {
    setSelectedEventId(id);
    const el = cardRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleExtract = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputType, content, provider, model }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvents(data.events || []);
    } catch (e: any) {
      alert(`Extraction Failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnrich = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, provider, model }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvents(data.events || events);
    } catch (e: any) {
      alert(`Enrichment Failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!confirm(`Submit ${events.length} events to the database?`)) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/events/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, dataset: 'dev' }), // Defaulting to dev
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert(`Successfully saved ${data.count} events!`);
    } catch (e: any) {
      alert(`Submission Failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    const jsonString = JSON.stringify({ events }, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `extracted_events_${new Date().toISOString()}.json`;
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
            ← Back
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Event Extractor & Enricher</h1>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as any)}
            className="border border-gray-300 rounded-md text-sm px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ollama">Local (Ollama)</option>
            <option value="gemini">API (Gemini)</option>
          </select>
          <input
            type="text"
            placeholder="Model (optional)"
            value={model}
            onChange={e => setModel(e.target.value)}
            className="border border-gray-300 rounded-md text-sm px-3 py-1.5 w-32 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Column: Input & List */}
        <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white">

          {/* Input Section */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setInputType('url')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${inputType === 'url' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
              >
                URL Input
              </button>
              <button
                onClick={() => setInputType('text')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${inputType === 'text' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}
              >
                Raw Text
              </button>
            </div>

            <div className="flex gap-2">
              {inputType === 'url' ? (
                <input
                  type="url"
                  className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="https://en.wikipedia.org/wiki/..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              ) : (
                <textarea
                  className="flex-1 border border-gray-300 rounded-md px-4 py-2 h-24 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Paste historical text here..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                />
              )}
              <button
                onClick={handleExtract}
                disabled={isProcessing || !content}
                className="bg-blue-600 text-white px-6 py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? <Loader2 className="animate-spin w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
                Extract
              </button>
            </div>
          </div>

          {/* Actions Bar */}
          {events.length > 0 && (
            <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="text-sm text-gray-500">{events.length} Events Found</div>
              <div className="flex gap-2">
                <button onClick={handleEnrich} disabled={isProcessing} className="px-3 py-1.5 text-sm border border-purple-200 text-purple-700 bg-purple-50 rounded hover:bg-purple-100 flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Enrich Matches
                </button>
                <button onClick={handleDownload} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-1">
                  <Download className="w-3 h-3" /> JSON
                </button>
                <button onClick={handleSubmit} disabled={isProcessing} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1">
                  <Save className="w-3 h-3" /> Submit DB
                </button>
              </div>
            </div>
          )}

          {/* Event List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-100">
            {events.map((event) => (
              <div
                key={event.id}
                ref={el => { cardRefs.current[event.id] = el }}
                className={`bg-white rounded-lg shadow-sm border p-4 transition-all ${selectedEventId === event.id ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200'}`}
                onClick={() => setSelectedEventId(event.id)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 mr-4">
                    <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Title</label>
                    <input
                      value={event.title}
                      onChange={e => updateEvent(event.id, 'title', e.target.value)}
                      className="w-full font-semibold text-gray-800 border-b border-transparent focus:border-blue-500 outline-none hover:border-gray-300 transition-colors"
                    />
                  </div>
                  <button onClick={() => removeEvent(event.id)} className="text-gray-400 hover:text-red-500 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Summary */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">Summary</label>
                  <textarea
                    value={event.summary}
                    onChange={e => updateEvent(event.id, 'summary', e.target.value)}
                    className="w-full text-sm text-gray-600 border border-gray-100 rounded p-2 focus:border-blue-500 outline-none h-16 resize-none"
                  />
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 text-sm">

                  {/* Time */}
                  <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="flex items-center gap-1 text-gray-500 mb-2">
                      <Calendar className="w-3 h-3" /> <span className="text-xs font-bold">START TIME</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400">YEAR</label>
                        <input
                          type="number"
                          value={event.start.year}
                          onChange={e => updateEvent(event.id, 'start.year', parseInt(e.target.value))}
                          className="w-full bg-white border border-gray-200 rounded px-1 text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">PRECISION</label>
                        <select
                          value={event.start.precision}
                          onChange={e => updateEvent(event.id, 'start.precision', e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded px-1 text-[10px]"
                        >
                          {['millennium', 'century', 'decade', 'year', 'month', 'day', 'hour', 'minute'].map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <div className="flex items-center gap-1 text-gray-500 mb-2">
                      <MapPin className="w-3 h-3" /> <span className="text-xs font-bold">LOCATION</span>
                    </div>
                    <div className="mb-1">
                      <input
                        value={event.location.placeName || ''}
                        onChange={e => updateEvent(event.id, 'location.placeName', e.target.value)}
                        placeholder="Place Name"
                        className="w-full bg-white border border-gray-200 rounded px-1 text-xs mb-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-400">LAT</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={event.location.lat || 0}
                          onChange={e => updateEvent(event.id, 'location.lat', parseFloat(e.target.value))}
                          className="w-full bg-white border border-gray-200 rounded px-1 text-center text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400">LNG</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={event.location.lng || 0}
                          onChange={e => updateEvent(event.id, 'location.lng', parseFloat(e.target.value))}
                          className="w-full bg-white border border-gray-200 rounded px-1 text-center text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {events.length === 0 && !isProcessing && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Type className="w-12 h-12 mb-4 opacity-20" />
                <p>No events extracted yet.</p>
                <p className="text-sm">Enter a URL or text and click Extract.</p>
              </div>
            )}
          </div>

        </div>

        {/* Right Column: Map */}
        <div className="w-1/2 bg-gray-200 relative">
          <MapWithNoSSR events={events} onMarkerClick={handleScrollToCard} />

          {/* Legend / Overlay Info */}
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-4 rounded-lg shadow-lg text-xs z-[1000] max-w-xs">
            <h3 className="font-bold mb-2 flex items-center gap-2"><Globe className="w-4 h-4" /> Map Visualization</h3>
            <p className="text-gray-600 mb-2">
              Markers represent extracted locations.
              <br />Click to scroll to event details.
            </p>
            <div className="flex gap-2 items-center">
              <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
              <span>Event Location</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
