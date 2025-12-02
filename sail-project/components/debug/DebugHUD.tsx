import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Database, Eye, Map as MapIcon, Globe } from 'lucide-react';
import { MapBounds } from '../../types';

interface DebugHUDProps {
  zoom: number;
  center: { lat: number; lng: number };
  bounds: MapBounds | null;
  lodThreshold: number;
  fetchedCount: number; // 从 API 拿到的原始数量
  renderedCount: number; // 最终渲染在地图上的数量
  isGlobalViewGuess: boolean; // 前端估算的“全球视野”状态
}

export const DebugHUD: React.FC<DebugHUDProps> = ({
  zoom,
  center,
  bounds,
  lodThreshold,
  fetchedCount,
  renderedCount,
  isGlobalViewGuess
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 只在开发环境或特定条件下显示 (可选)
  // if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed top-24 left-6 z-[9999] font-mono text-xs shadow-2xl border border-slate-200 bg-white/90 backdrop-blur-md rounded-lg overflow-hidden w-64 transition-all">
      {/* Header / Toggle */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <Activity size={14} className="text-blue-600" />
          <span>Dev Monitor</span>
        </div>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          
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
                 N:{bounds.north.toFixed(1)} S:{bounds.south.toFixed(1)} <br/>
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
            
            {/* Fetched vs Rendered Bar */}
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
            
            {/* Visual Bar Graph */}
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

          {/* Section 3: Logic */}
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

        </div>
      )}
    </div>
  );
};