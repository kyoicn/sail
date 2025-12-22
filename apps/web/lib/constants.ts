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
      radius: 40,
      blur: 25,
      minOpacity: 0.2,
      maxZoom: 12,
      gradient: {
        0.1: '#f0f9ff', // sky-50
        0.3: '#7dd3fc', // sky-300
        0.6: '#0284c7', // sky-600
        0.9: '#0c4a6e', // sky-900
        1.0: '#082f49'  // sky-950
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