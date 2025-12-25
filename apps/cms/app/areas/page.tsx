'use client';

import { useState, useEffect } from 'react';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Loader2, Search, Database, AlertCircle, PlayCircle } from 'lucide-react';

// Dynamic import for Map to avoid SSR issues with Leaflet
const AreaMap = dynamic(() => import('@/components/AreaMap'), {
  ssr: false,
  loading: () => <div className="h-full flex items-center justify-center bg-gray-100">Loading Map...</div>
});

import { AreaSummary, AreaDetail } from '@sail/shared';

export default function AreasPage() {
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [selectedArea, setSelectedArea] = useState<AreaDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [dataset, setDataset] = useState('dev'); // Default to Dev

  // 1. Fetch List (Lightweight)
  useEffect(() => {
    async function fetchAreas() {
      try {
        setLoadingList(true);
        // Pass dataset param
        const res = await fetch(`/api/areas?limit=100&dataset=${dataset}`);
        if (!res.ok) throw new Error('Failed to fetch areas');

        const data = await res.json();
        setAreas(data);
      } catch (e) {
        console.error('Error fetching areas:', e);
      } finally {
        setLoadingList(false);
      }
    }

    fetchAreas();
  }, [dataset]);

  // 2. Fetch Detail (Geometry) on Select
  async function handleSelectArea(summary: AreaSummary) {
    try {
      setLoadingDetail(true);
      // Optimistic update
      setSelectedArea({ ...summary, geometry: null });

      // Use 'area_id' (slug) to fetch detail because our RPC uses slugs
      // Pass dataset param
      const res = await fetch(`/api/areas?id=${summary.area_id}&dataset=${dataset}`);
      if (!res.ok) throw new Error('Failed to fetch area detail');

      const data = await res.json();
      if (data) {
        setSelectedArea(data);
      }
    } catch (e) {
      console.error('Error fetching details:', e);
    } finally {
      setLoadingDetail(false);
    }
  }

  const filteredAreas = areas.filter(area =>
    area.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    area.area_id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-50 flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">
            ← Back
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Area Manager</h1>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar List */}
        <div className="w-80 min-w-[320px] border-r border-gray-200 bg-white flex flex-col z-10 shadow-lg">
          {/* Sidebar Header (Controls) */}
          <div className="p-4 border-b border-gray-200 space-y-4">
            {/* Dataset Selector */}
            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Environment</label>
                <div className="relative">
                  <select
                    value={dataset}
                    onChange={(e) => {
                      setDataset(e.target.value);
                      setSelectedArea(null); // Clear selection on env switch
                    }}
                    className={`
                          w-full appearance-none pl-9 pr-8 py-2 rounded-lg text-sm font-medium border-2 outline-none transition-all
                          ${dataset === 'prod' ? 'border-red-100 bg-red-50 text-red-700 hover:border-red-200' : ''}
                          ${dataset === 'staging' ? 'border-amber-100 bg-amber-50 text-amber-700 hover:border-amber-200' : ''}
                          ${dataset === 'dev' ? 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200' : ''}
                      `}
                  >
                    <option value="prod">Production</option>
                    <option value="staging">Staging</option>
                    <option value="dev">Development</option>
                  </select>

                  {/* Icons */}
                  <div className="absolute left-3 top-2.5 pointer-events-none">
                    {dataset === 'prod' && <AlertCircle className="h-4 w-4 text-red-600" />}
                    {dataset === 'staging' && <PlayCircle className="h-4 w-4 text-amber-600" />}
                    {dataset === 'dev' && <Database className="h-4 w-4 text-emerald-600" />}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter areas..."
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredAreas.map(area => (
                  <button
                    key={area.id}
                    onClick={() => handleSelectArea(area)}
                    className={`
                      w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group
                      ${selectedArea?.area_id === area.area_id ? 'bg-blue-50/50 hover:bg-blue-50 border-l-4 border-blue-500 pl-[12px]' : 'border-l-4 border-transparent'}
                    `}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${selectedArea?.area_id === area.area_id ? 'text-blue-700' : 'text-gray-900 group-hover:text-gray-900'}`}>{area.display_name || 'Unnamed'}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{area.area_id}</div>
                    </div>
                  </button>
                ))}
                {filteredAreas.length === 0 && !loadingList && (
                  <div className="p-8 text-center text-sm text-gray-500">No areas found</div>
                )}
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="p-3 border-t border-gray-200 bg-gray-50 text-xs text-center text-gray-400">
            {filteredAreas.length} Areas Loaded
          </div>
        </div>

        {/* Main Content - Map */}
        <div className="flex-1 relative bg-slate-50">
          <div className="absolute inset-0 z-0">
            <AreaMap geoJson={selectedArea?.geometry || null} />
          </div>

          {/* Floating Info Card */}
          {selectedArea && (
            <div className="absolute top-4 right-4 z-[500] max-w-sm w-full">
              <div className="bg-white/95 backdrop-blur shadow-xl rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 leading-tight">{selectedArea.display_name}</h2>
                      <code className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">{selectedArea.area_id}</code>
                    </div>
                    {loadingDetail && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  </div>
                </div>
                {selectedArea.description ? (
                  <div className="p-4 text-sm text-gray-600 leading-relaxed bg-gray-50/50">
                    {selectedArea.description}
                  </div>
                ) : (
                  <div className="p-4 text-xs text-gray-400 italic">No description available</div>
                )}

                {/* Periods List */}
                {selectedArea.periods && selectedArea.periods.length > 0 && (
                  <div className="p-4 border-t border-gray-100 bg-white">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Associated Periods</h3>
                    <div className="space-y-2">
                      {selectedArea.periods.map((p) => (
                        <div key={p.period_id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-800">{p.display_name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${p.role === 'primary'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                              }`}>
                              {p.role}
                            </span>
                          </div>
                          <span className="text-gray-400 text-xs font-mono">
                            {p.start_year} - {p.end_year}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
