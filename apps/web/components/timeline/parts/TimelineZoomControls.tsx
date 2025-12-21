import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { ZOOM_SCALES, getClosestScale } from '../../../lib/time-engine';

interface TimelineZoomControlsProps {
  currentDate: number;
  viewRange: { min: number, max: number };
  setViewRange: (range: { min: number, max: number }) => void;
  globalMin: number;
  globalMax: number;
}

export const TimelineZoomControls: React.FC<TimelineZoomControlsProps> = ({
  currentDate,
  viewRange,
  setViewRange,
  globalMin,
  globalMax
}) => {
  const handleZoom = (factor: number) => {
    const span = viewRange.max - viewRange.min;
    const newSpan = span / factor;

    // Limit: Allow zoom down to approx 1 millisecond (~3e-11 years)
    if (factor > 1 && newSpan < 0.000000001) return;

    // Max zoom out limit
    if (factor < 1 && newSpan > (globalMax - globalMin)) {
      setViewRange({ min: globalMin, max: globalMax });
      return;
    }

    const newMin = Math.max(globalMin, currentDate - newSpan / 2);
    const newMax = Math.min(globalMax, newMin + newSpan);

    // Clamp to bounds
    if (newMin <= globalMin) setViewRange({ min: globalMin, max: globalMin + newSpan });
    else if (newMax >= globalMax) setViewRange({ min: globalMax - newSpan, max: globalMax });
    else setViewRange({ min: newMin, max: newMax });
  };

  const resetZoom = () => setViewRange({ min: globalMin, max: globalMax });

  return (
    <div className="h-full flex flex-col justify-center gap-2 relative z-10 group">
      {/* Vertical Scale Menu (Pop-out to the Right, Aligned to Panel Bottom) */}
      <div className="absolute left-full -bottom-4 pl-6 flex flex-row items-end opacity-0 -translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto transition-all duration-200 ease-out">
        <div className="glass-panel rounded-lg shadow-2xl p-1 flex flex-col gap-0.5 min-w-[120px]">
          {[
            { label: 'All / Reset', id: 'ALL', span: globalMax - globalMin },
            { label: 'Millennium', id: 'MILLENNIUM', span: ZOOM_SCALES.MILLENNIUM },
            { label: 'Century', id: 'CENTURY', span: ZOOM_SCALES.CENTURY },
            { label: 'Decade', id: 'DECADE', span: ZOOM_SCALES.DECADE },
            { label: 'Year', id: 'YEAR', span: ZOOM_SCALES.YEAR },
            { label: 'Month', id: 'MONTH', span: ZOOM_SCALES.MONTH },
            { label: 'Day', id: 'DAY', span: ZOOM_SCALES.DAY },
          ].map((scale) => {
            const currentSpan = viewRange.max - viewRange.min;
            const activeKey = getClosestScale(currentSpan, globalMax - globalMin);
            const isActive = activeKey === scale.id;

            return (
              <button
                key={scale.id}
                onClick={(e) => {
                  e.stopPropagation();
                  // Special case for 'All' or just standard setViewRange
                  if (scale.id === 'ALL') {
                    resetZoom();
                  } else {
                    const newSpan = scale.span;
                    const newMin = Math.max(globalMin, currentDate - newSpan / 2);
                    const newMax = Math.min(globalMax, newMin + newSpan);
                    // Clamp bounds if needed, but centering on currentDate is priority
                    if (newMin <= globalMin) setViewRange({ min: globalMin, max: globalMin + newSpan });
                    else if (newMax >= globalMax) setViewRange({ min: globalMax - newSpan, max: globalMax });
                    else setViewRange({ min: newMin, max: newMax });
                  }
                }}
                className={`
                        px-3 py-1.5 text-xs font-medium text-left rounded-md w-full whitespace-nowrap transition-colors
                        ${isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                      `}
              >
                {scale.label}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={() => handleZoom(2)} className="p-2 rounded-lg bg-white/40 border border-black/5 text-slate-500 hover:text-blue-600 hover:bg-white/60 hover:border-blue-200 transition-all shadow-sm" title="Zoom In">
        <ZoomIn size={20} />
      </button>
      <button onClick={() => handleZoom(0.5)} className="p-2 rounded-lg bg-white/40 border border-black/5 text-slate-500 hover:text-blue-600 hover:bg-white/60 hover:border-blue-200 transition-all shadow-sm" title="Zoom Out">
        <ZoomOut size={20} />
      </button>
    </div>
  );
};
