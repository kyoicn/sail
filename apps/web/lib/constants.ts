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
export interface DotStyleConfig {
  label: string;
  colors: {
    start: [number, number, number];
    mid: [number, number, number];
    end: [number, number, number];
  };
  shape: 'circle' | 'square' | 'diamond' | 'ring' | 'pulse';
  effect: 'none' | 'glow' | 'shadow' | 'soft';
  sizeMultiplier: number;
  borderWidth: number;
}

export const DOT_STYLES: Record<string, DotStyleConfig> = {
  'classic': {
    label: 'Classic (Cyan/Blue)',
    colors: {
      start: [34, 211, 238],
      mid: [59, 130, 246],
      end: [49, 46, 129]
    },
    shape: 'circle',
    effect: 'soft',
    sizeMultiplier: 1.0,
    borderWidth: 2
  },
  'volcano': {
    label: 'Volcano (Yellow/Red)',
    colors: {
      start: [253, 224, 71], // yellow-300
      mid: [249, 115, 22],  // orange-500
      end: [153, 27, 27]   // red-800
    },
    shape: 'pulse',
    effect: 'glow',
    sizeMultiplier: 1.1,
    borderWidth: 1
  },
  'emerald': {
    label: 'Emerald (Square)',
    colors: {
      start: [190, 242, 100], // lime-300
      mid: [20, 184, 166],    // teal-500
      end: [19, 78, 74]       // teal-900
    },
    shape: 'square',
    effect: 'shadow',
    sizeMultiplier: 0.9,
    borderWidth: 2
  },
  'sunset': {
    label: 'Sunset (Diamond Glow)',
    colors: {
      start: [249, 168, 212], // pink-300
      mid: [168, 85, 247],    // purple-500
      end: [88, 28, 135]      // purple-900
    },
    shape: 'diamond',
    effect: 'glow',
    sizeMultiplier: 1.2,
    borderWidth: 1
  },
  'ghost': {
    label: 'Techno (Outer Ring)',
    colors: {
      start: [165, 180, 252], // indigo-300
      mid: [99, 102, 241],    // indigo-500
      end: [55, 48, 163]      // indigo-900
    },
    shape: 'ring',
    effect: 'none',
    sizeMultiplier: 1.3,
    borderWidth: 3
  },
  'slate': {
    label: 'Slate (Muted)',
    colors: {
      start: [203, 213, 225], // slate-300
      mid: [71, 85, 105],     // slate-600
      end: [15, 23, 42]       // slate-900
    },
    shape: 'circle',
    effect: 'none',
    sizeMultiplier: 0.8,
    borderWidth: 1
  }
};