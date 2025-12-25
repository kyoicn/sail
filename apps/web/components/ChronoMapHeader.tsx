"use client";

import React, { useState, useRef } from 'react';
import { Map as MapIcon, Layers, Loader2, Plus, Minus, Sun, Moon } from 'lucide-react';
import { MapStyleSelector } from './map/MapStyleSelector';

interface ChronoMapHeaderProps {
  dataset: string;
  isLoading: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  mapStyle: string;
  setMapStyle: (style: string) => void;
  onZoom: (type: 'in' | 'out') => void;
}

export function ChronoMapHeader({
  dataset,
  isLoading,
  theme,
  toggleTheme,
  mapStyle,
  setMapStyle,
  onZoom
}: ChronoMapHeaderProps) {
  const [isStyleSelectorOpen, setIsStyleSelectorOpen] = useState(false);
  const layersButtonRef = useRef<HTMLButtonElement>(null);

  // [NEW] Intelligent Theme Switching Logic moved here or kept in parent?
  // The logic in page.tsx was:
  /*
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      // Auto-switch map style if we are on the default for the *previous* theme
      if (prev === 'light' && mapStyle === 'voyager') {
        setMapStyle('dark_matter');
      } else if (prev === 'dark' && mapStyle === 'dark_matter') {
        setMapStyle('voyager');
      }
      return next;
    });
  };
  */
  // The prompt passed `toggleTheme` as a prop, which implies the logic stays in parent or is passed down.
  // The plan said: "Props: toggleTheme: () => void". So I assume the logic stays in page.tsx for now, 
  // or I should have refactored it. 
  // However, `setMapStyle` is also passed. 
  // If I move the logic *into* the component, I need `setTheme` which is not passed, only `toggleTheme`.
  // So the parent handles the actual toggle.

  return (
    <header className="absolute top-0 left-0 right-0 z-20 px-6 py-4 pointer-events-none">
      <div className="w-full flex justify-between items-start">
        <div className="bg-white/90 backdrop-blur-md shadow-sm rounded-2xl px-5 py-3 pointer-events-auto border border-white/50 flex items-center gap-3">
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <MapIcon className="text-blue-600 w-6 h-6" />
            Sail
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">Beta</span>
          </h1>

          {isLoading && (
            <div className="flex items-center gap-2 px-2 border-l border-slate-200">
              <Loader2 className="animate-spin text-blue-500 w-4 h-4" />
              <span className="text-xs text-slate-500 font-medium">Updating...</span>
            </div>
          )}

          {dataset !== 'prod' && (
            <span className={`text-[10px] font-mono px-1 rounded border uppercase tracking-wider
              ${dataset === 'staging'
                ? 'text-blue-600 bg-blue-100 border-blue-200'
                : 'text-orange-600 bg-orange-100 border-orange-200'
              }
            `}>
              DATA: {dataset.toUpperCase()}
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <button
            onClick={toggleTheme}
            className="bg-white/90 backdrop-blur-md p-2.5 rounded-full text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all shadow-sm border border-white/50"
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button
            ref={layersButtonRef}
            onClick={() => setIsStyleSelectorOpen(!isStyleSelectorOpen)}
            className={`p-2.5 rounded-full text-slate-600 transition-all shadow-sm border border-white/50
            ${isStyleSelectorOpen ? 'bg-blue-50 text-blue-600' : 'bg-white/90 backdrop-blur-md hover:text-blue-600 hover:bg-blue-50'}
            `}>
            <Layers size={20} />
          </button>
          <div className="flex flex-col gap-px bg-white/90 backdrop-blur-md rounded-full shadow-sm border border-white/50 overflow-hidden">
            <button
              onClick={() => onZoom('in')}
              className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all"
            >
              <Plus size={20} />
            </button>
            <div className="h-px bg-slate-200 mx-2" />
            <button
              onClick={() => onZoom('out')}
              className="p-2.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-all"
            >
              <Minus size={20} />
            </button>
          </div>
        </div>
      </div>

      <MapStyleSelector
        isOpen={isStyleSelectorOpen}
        onClose={() => setIsStyleSelectorOpen(false)}
        currentStyle={mapStyle}
        triggerRef={layersButtonRef}
        onStyleSelect={(style) => {
          setMapStyle(style);
        }}
      />
    </header>
  );
}
