import React, { useEffect, useRef } from 'react';
import { MAP_STYLES } from '../../lib/constants';

interface MapStyleSelectorProps {
  currentStyle: string;
  onStyleSelect: (styleKey: string) => void;
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const MapStyleSelector: React.FC<MapStyleSelectorProps> = ({
  currentStyle,
  onStyleSelect,
  isOpen,
  onClose,
  triggerRef
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If clicking on the trigger button, let the button handle logic (don't close here, wait for toggle)
      if (triggerRef?.current && triggerRef.current.contains(event.target as Node)) {
        return;
      }

      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const styles = Object.entries(MAP_STYLES);

  const getLocalThumbnail = (key: string) => {
    if (key === 'satellite' || key === 'terrain') return `/map-thumbs/${key}.jpg`;
    return `/map-thumbs/${key}.png`;
  };

  return (
    <div ref={ref} className="absolute top-20 right-20 z-30 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-2 w-64 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between px-2 py-1 mb-2 border-b border-slate-200/50">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Map Style</span>
      </div>
      <div className="flex flex-col gap-1">
        {styles.map(([key, config]) => (
          <button
            key={key}
            onClick={() => {
              onStyleSelect(key);
              // We don't close automatically to let them browse, or we can?
              // Let's keep it open.
            }}
            className={`
              flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all
              ${currentStyle === key
                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-medium'
                : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'}
            `}
          >
            {/* Simple Preview Swatch */}
            <div className={`w-10 h-10 rounded-lg border shadow-sm shrink-0 overflow-hidden relative ${currentStyle === key ? 'border-blue-300' : 'border-slate-200'}`}>
              <img
                src={getLocalThumbnail(key)}
                alt={config.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-sm">{config.label.split(' (')[0]}</span>
              <span className="text-[10px] opacity-60 leading-tight">
                {config.label.split('(')[1]?.replace(')', '') || 'Map'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
