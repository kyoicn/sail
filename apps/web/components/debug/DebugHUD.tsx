import React, { useState, useEffect, useRef } from 'react';
import { Activity, ChevronDown, ChevronUp, Database, Eye, Map as MapIcon, Globe, Layers } from 'lucide-react';
import { EventData, MapBounds } from '@sail/shared';
import { HEATMAP_STYLES, DOT_STYLES } from '../../lib/constants';

interface DebugHUDProps {
  zoom: number;
  center: { lat: number; lng: number };
  bounds: MapBounds | null;
  lodThreshold: number;
  fetchedCount: number;
  renderedCount: number;
  isGlobalViewGuess: boolean;
  // [NEW]
  activeEvents: EventData[];
  expandedEventIds: Set<string>;
  showHeatmap: boolean;
  setShowHeatmap: (v: boolean) => void;
  heatmapStyle: string;
  setHeatmapStyle: (v: string) => void;
  showDots: boolean;
  setShowDots: (v: boolean) => void;
  dotStyle: string;
  setDotStyle: (v: string) => void;
}

export const DebugHUD: React.FC<DebugHUDProps> = ({
  zoom,
  center,
  bounds,
  lodThreshold,
  fetchedCount,
  renderedCount,
  isGlobalViewGuess,
  activeEvents,
  expandedEventIds,
  // [NEW] Visual Toggles
  showHeatmap,
  setShowHeatmap,
  heatmapStyle,
  setHeatmapStyle,
  showDots,
  setShowDots,
  dotStyle,
  setDotStyle
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [inspectedEventId, setInspectedEventId] = useState<string | null>(null);

  // [NEW] Drag State
  const [position, setPosition] = useState({ x: 24, y: 96 }); // Default: left-6 (24px), top-24 (96px)
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  // Derive expanded events from the active list (or just check IDs)
  // Note: expanded events might not be in activeEvents if filtered out, 
  // but essentially we just want to show what's passed in.
  const openEvents = activeEvents.filter(e => expandedEventIds.has(e.id));

  return (
    <div
      className="fixed z-[9999] font-mono text-xs shadow-2xl border border-slate-200 bg-white/90 backdrop-blur-md rounded-lg overflow-hidden w-64 transition-shadow max-h-[80vh] flex flex-col"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header / Toggle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-slate-100 cursor-move hover:bg-slate-200 transition-colors shrink-0 select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 font-bold text-slate-700 pointer-events-none">
          <Activity size={14} className="text-blue-600" />
          <span>Dev Monitor</span>
        </div>
        <div
          className="p-1 -mr-1 hover:bg-slate-300 rounded cursor-pointer"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar">

          {/* Section 1: Viewport */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <MapIcon size={12} />
              <span className="font-semibold uppercase tracking-wider">Viewport</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <div className="flex justify-between">
                <span>Zoom:</span>
                <span className="font-bold text-blue-600">{zoom.toFixed(2)}</span>
              </div>
              <div className="flex justify-between" title="Backend Threshold < 5.5">
                <span>Mode:</span>
                <span className={`font-bold ${isGlobalViewGuess ? 'text-green-600' : 'text-orange-600'}`}>
                  {isGlobalViewGuess ? 'GLOBAL' : 'LOCAL'}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 truncate mt-1">
              Center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
            </div>
            {bounds && (
              <div className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                N:{bounds.north.toFixed(1)} S:{bounds.south.toFixed(1)} <br />
                W:{bounds.west.toFixed(1)} E:{bounds.east.toFixed(1)}
              </div>
            )}
          </div>

          {/* Section 2: Data Pipeline */}
          <div className="space-y-1 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Database size={12} />
              <span className="font-semibold uppercase tracking-wider">Data Pipeline</span>
            </div>

            <div className="flex items-center justify-between mb-1">
              <span>Fetched:</span>
              <span className="font-bold">{fetchedCount}</span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span>Rendered:</span>
              <span className={`font-bold ${renderedCount === 0 ? 'text-red-500' : 'text-slate-700'}`}>
                {renderedCount}
              </span>
            </div>

            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.min(100, (renderedCount / (fetchedCount || 1)) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-right text-slate-400">
              {fetchedCount > 0 ? ((renderedCount / fetchedCount) * 100).toFixed(1) : 0}% Passing Filter
            </div>
          </div>

          {/* Section 3: LOD Logic */}
          <div className="space-y-1 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Eye size={12} />
              <span className="font-semibold uppercase tracking-wider">LOD Logic</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Min Importance:</span>
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold border border-slate-300">
                {lodThreshold}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Events with importance &lt; {lodThreshold} are hidden.
            </div>
          </div>

          {/* Section 4: Visual Layers */}
          <div className="space-y-1 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Layers size={12} />
              <span className="font-semibold uppercase tracking-wider">Visual Layers</span>
            </div>
            <div className="space-y-1">
              <label className="flex items-center justify-between text-[10px] cursor-pointer hover:bg-slate-50 p-1 rounded">
                <span className="text-slate-700">Show Heatmap</span>
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0 w-3 h-3"
                />
              </label>

              {/* Heatmap Style Selector */}
              {showHeatmap && (
                <div className="pl-4 pr-1 pb-1">
                  <select
                    value={heatmapStyle}
                    onChange={(e) => setHeatmapStyle(e.target.value)}
                    className="w-full text-[10px] p-1 rounded border border-slate-300 bg-white text-slate-700"
                  >
                    {Object.entries(HEATMAP_STYLES).map(([key, style]) => (
                      <option key={key} value={key}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center justify-between text-[10px] cursor-pointer hover:bg-slate-50 p-1 rounded">
                <span className="text-slate-700">Show Dots (LOD)</span>
                <input
                  type="checkbox"
                  checked={showDots}
                  onChange={(e) => setShowDots(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0 w-3 h-3"
                />
              </label>

              {/* Dot Style Selector */}
              {showDots && (
                <div className="pl-4 pr-1 pb-1">
                  <select
                    value={dotStyle}
                    onChange={(e) => setDotStyle(e.target.value)}
                    className="w-full text-[10px] p-1 rounded border border-slate-300 bg-white text-slate-700"
                  >
                    {Object.entries(DOT_STYLES).map(([key, style]) => (
                      <option key={key} value={key}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Context (Active & Open) */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Layers size={12} />
              <span className="font-semibold uppercase tracking-wider">Context</span>
            </div>

            {/* Open Cards */}
            {expandedEventIds.size > 0 && (
              <div className="bg-blue-50 rounded border border-blue-100 p-2">
                <div className="text-[10px] font-bold text-blue-600 mb-1 flex justify-between">
                  <span>OPEN CARDS</span>
                  <span>{expandedEventIds.size}</span>
                </div>
                <div className="space-y-1">
                  {openEvents.map(e => (
                    <div
                      key={e.id}
                      className={`text-[10px] leading-tight cursor-pointer rounded p-1 transition-colors ${inspectedEventId === e.id ? 'bg-blue-100' : 'hover:bg-blue-100/50'
                        }`}
                      onClick={() => setInspectedEventId(inspectedEventId === e.id ? null : e.id)}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <span><span className="font-bold">{e.start.year}:</span> {e.title.substring(0, 20)}...</span>
                        {inspectedEventId === e.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </div>

                      {inspectedEventId === e.id && (
                        <div className="mt-1 pl-2 border-l-2 border-blue-200 text-slate-600 space-y-0.5 select-text cursor-text" onClick={e => e.stopPropagation()}>
                          <div className="break-all"><span className="font-semibold">ID:</span> {e.id}</div>
                          <div><span className="font-semibold">Imp:</span> {e.importance}</div>
                          <div className="truncate"><span className="font-semibold">Loc:</span> {e.location.lat.toFixed(6)},{e.location.lng.toFixed(6)}</div>
                          {e.source_id && <div className="truncate"><span className="font-semibold">Src:</span> {e.source_id}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                  {openEvents.length < expandedEventIds.size && (
                    <div className="text-[10px] text-slate-400 italic">
                      +{expandedEventIds.size - openEvents.length} hidden by filter
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Active List */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 mb-1 flex justify-between">
                <span>ACTIVE LIST</span>
                <span>{activeEvents.length}</span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 border border-slate-100 rounded p-1">
                {activeEvents.map(e => (
                  <div key={e.id} className="text-[10px] flex justify-between items-center hover:bg-slate-50 p-0.5 rounded cursor-help" title={`ID: ${e.id}\nImp: ${e.importance}\nLoc: ${e.location.lat},${e.location.lng}`}>
                    <span className="truncate w-3/4">{e.title}</span>
                    <span className="text-slate-400 font-mono">{e.start.year}</span>
                  </div>
                ))}
                {activeEvents.length === 0 && (
                  <div className="text-[10px] text-slate-400 italic text-center py-2">No active events</div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};