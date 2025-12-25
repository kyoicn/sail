import { EventData } from '@sail/shared';

// --- Mock Data (Migrated) ---
export { PREDEFINED_REGIONS, MOCK_EVENTS } from './mock_data';

// --- Heatmap Configuration ---
export interface HeatmapStyleConfig {
  label: string;
  config: {
    radius: number;
    blur: number;
    minOpacity: number;
    gradient: Record<number, string>;
  }
}

export const HEATMAP_STYLES: Record<string, HeatmapStyleConfig> = {
  'classic': {
    label: 'Classic (Rainbow)',
    config: {
      radius: 35,
      blur: 20,
      minOpacity: 0.3,
      gradient: {
        0.2: 'blue',
        0.4: 'cyan',
        0.6: 'lime',
        0.8: 'yellow',
        1.0: 'red'
      }
    }
  },
  'inferno': {
    label: 'Inferno (Dark)',
    config: {
      radius: 30,
      blur: 15,
      minOpacity: 0.4,
      gradient: {
        0.0: 'black',
        0.3: 'maroon',
        0.6: 'red',
        0.8: 'orange',
        1.0: 'white'
      }
    }
  },
  'ocean': {
    label: 'Deep Ocean',
    config: {
      radius: 30,
      blur: 25,
      minOpacity: 0.3,
      maxZoom: 12,
      gradient: {
        0.1: '#f0f9ff', // sky-50
        0.3: '#99cbe2ff', // sky-300
        0.6: '#68abcdff', // sky-600
        0.9: '#4088b1ff', // sky-900
        1.0: '#236794ff'  // sky-950
      }
    } as any
  },
  'plasma': {
    label: 'Plasma (Purple/Orange)',
    config: {
      radius: 35,
      blur: 20,
      minOpacity: 0.3,
      gradient: {
        0.0: '#0d0887', // dark blue
        0.4: '#9c179e', // purple
        0.7: '#ed7953', // orange
        1.0: '#f0f921'  // yellow
      }
    }
  },
  'monochrome': {
    label: 'Blue Ghost',
    config: {
      radius: 30,
      blur: 20,
      minOpacity: 0.1,
      gradient: {
        0.0: 'rgba(59, 130, 246, 0)',
        0.5: 'rgba(59, 130, 246, 0.5)',
        1.0: 'rgba(59, 130, 246, 1)'
      }
    }
  }
};

// --- Dot Styles Configuration ---
export type DotShape = 'circle' | 'square' | 'diamond' | 'ring' | 'pulse';
export type DotEffect = 'none' | 'glow' | 'shadow' | 'soft';

export interface ShapeStyle {
  borderRadius: string;
  transform?: string;
  className?: string;
  isHollow?: boolean;
  hasOuterWhiteBorder?: boolean;
}

export const SHAPE_CONFIGS: Record<DotShape, ShapeStyle> = {
  'circle': { borderRadius: '50%' },
  'square': { borderRadius: '4px' },
  'diamond': { borderRadius: '2px', transform: 'rotate(45deg)' },
  'ring': { borderRadius: '50%', isHollow: true, hasOuterWhiteBorder: true },
  'pulse': { borderRadius: '50%', className: 'animate-pulse-slow' }
};

export interface EffectStyle {
  getBoxShadow: (color: string) => string;
}

export const EFFECT_CONFIGS: Record<DotEffect, EffectStyle> = {
  'none': { getBoxShadow: () => 'none' },
  'glow': { getBoxShadow: (color) => `0 0 10px ${color}, 0 0 20px ${color}44` },
  'shadow': { getBoxShadow: () => '2px 4px 8px rgba(0,0,0,0.5)' },
  'soft': { getBoxShadow: () => '0 4px 12px rgba(0,0,0,0.15)' }
};

export interface DotStyleConfig {
  label: string;
  colors: {
    start: string;
    mid: string;
    end: string;
  };
  shape: DotShape;
  effect: DotEffect;
  sizeMultiplier: number;
  borderWidth: number;
}

export const DOT_STYLES: Record<string, DotStyleConfig> = {
  'classic': {
    label: 'Standard (Hollow Blue)',
    colors: {
      start: '#60a5fa', // blue-400 (was cyan-400 #22d3ee)
      mid: '#2563eb',   // blue-600 (was blue-500 #3b82f6)
      end: '#1e40af'    // blue-800 (was indigo-900 #312e81)
    },
    shape: 'ring',
    effect: 'soft',
    sizeMultiplier: 1.0,
    borderWidth: 4
  },
  'volcano': {
    label: 'Container (Solid Blue)',
    colors: {
      start: '#60a5fa', // blue-400
      mid: '#2563eb',   // blue-600
      end: '#1e40af'    // blue-800
    },
    shape: 'circle',
    effect: 'soft',
    sizeMultiplier: 1.1,
    borderWidth: 1
  },
  'emerald': {
    label: 'Emerald (Square)',
    colors: {
      start: '#bef264', // lime-300
      mid: '#14b8a6',    // teal-500
      end: '#134e4a'       // teal-900
    },
    shape: 'square',
    effect: 'shadow',
    sizeMultiplier: 0.9,
    borderWidth: 2
  },
  'sunset': {
    label: 'Sunset (Diamond Glow)',
    colors: {
      start: '#f9a8d4', // pink-300
      mid: '#a855f7',    // purple-500
      end: '#581c87'      // purple-900
    },
    shape: 'diamond',
    effect: 'glow',
    sizeMultiplier: 1.2,
    borderWidth: 1
  },
  'ghost': {
    label: 'Techno (Outer Ring)',
    colors: {
      start: '#a5b4fc', // indigo-300
      mid: '#6366f1',    // indigo-500
      end: '#3730a3'      // indigo-900
    },
    shape: 'ring',
    effect: 'none',
    sizeMultiplier: 1.3,
    borderWidth: 3
  },
  'slate': {
    label: 'Slate (Muted)',
    colors: {
      start: '#cbd5e1', // slate-300
      mid: '#475569',     // slate-600
      end: '#0f172a'       // slate-900
    },
    shape: 'circle',
    effect: 'none',
    sizeMultiplier: 0.8,
    borderWidth: 1
  },
  'focus': {
    label: 'Focus (Neon Orchid)',
    colors: {
      start: '#d67b1bff',
      mid: '#d67b1bff',
      end: '#d67b1bff'
    },
    shape: 'circle',
    effect: 'glow',
    sizeMultiplier: 1.2,
    borderWidth: 2
  }
};

// --- Map Tile Configurations ---
export interface MapStyleConfig {
  label: string;
  url: string;
  attribution: string;
  maxZoom?: number;
  subdomains?: string;
  theme: 'light' | 'dark';
}

export const MAP_STYLES: Record<string, MapStyleConfig> = {
  'positron': {
    label: 'Positron (Clean Light)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    theme: 'light'
  },
  'voyager': {
    label: 'Voyager (Colorful)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    theme: 'light'
  },
  'dark_matter': {
    label: 'Dark Matter (High Contrast)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    theme: 'dark'
  },
  'satellite': {
    label: 'Satellite (Imagery)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 19,
    theme: 'dark' // Satellite is usually dark/rich
  },
  'terrain': {
    label: 'Terrain (Physical)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 19,
    theme: 'light'
  }
};