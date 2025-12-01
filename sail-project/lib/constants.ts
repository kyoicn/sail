import { EventData } from '../types';

// --- Region Definitions ---

/**
 * Predefined geographical shapes for regions.
 * * Format: Array of [latitude, longitude] tuples forming a closed polygon.
 * Usage: These are referenced by 'regionId' in the EventData location object.
 * Note: In the future (Step 4), this should be replaced by a GeoJSON fetch or database storage.
 */
export const PREDEFINED_REGIONS: Record<string, [number, number][]> = {
  // Approximate bounds for Ancient Egypt
  'egypt': [
    [31.5, 25.0], [31.5, 34.0], [22.0, 34.0], [22.0, 25.0]
  ],
  // Polygon covering the Italian Peninsula
  'italy': [
    [46.5, 12.0], [45.0, 13.0], [44.0, 12.5], [42.0, 14.0], 
    [40.0, 18.0], [38.0, 16.0], [38.0, 15.5], [40.0, 15.0], 
    [42.0, 12.0], [44.0, 10.0], [44.5, 7.0], [46.0, 7.0]
  ],
  // Broad European continent definition for macro-events (like WWI)
  'europe': [
    [36.0, -10.0], [55.0, -10.0], [60.0, 5.0], [60.0, 30.0], 
    [45.0, 40.0], [35.0, 25.0], [36.0, -5.0]
  ],
  // Core territory for ancient Chinese dynasties
  'china_heartland': [
    [40.0, 110.0], [40.0, 120.0], [30.0, 122.0], 
    [22.0, 115.0], [25.0, 100.0], [35.0, 100.0]
  ],
  // Eastern United States
  'usa_east': [
    [45.0, -85.0], [45.0, -70.0], [30.0, -80.0], [30.0, -90.0]
  ],
  // Mesopotamia region for Babylonian events
  'babylon_region': [
    [34.0, 42.0], [34.0, 46.0], [30.0, 48.0], [30.0, 44.0]
  ]
};

// --- Mock Events ---

/**
 * Temporary mock data for development (MVP Phase).
 * * TODO [Step 3]: This constant will be replaced by a Firestore data fetch hook.
 * Ensure the structure matches 'EventData' interface strictly to ease the migration.
 */
export const MOCK_EVENTS: EventData[] = [
  { 
    id: '1', 
    title: 'Great Pyramid', 
    start: { year: -2560, precision: 'year' }, 
    location: { 
      lat: 29.9792, 
      lng: 31.1342, 
      placeName: 'Giza, Egypt', 
      granularity: 'spot', 
      certainty: 'definite', 
      regionId: 'egypt' // Links to PREDEFINED_REGIONS['egypt']
    }, 
    summary: 'The Great Pyramid of Giza is completed.', 
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg' 
  },
  { 
    id: '2', 
    title: 'Code of Hammurabi', 
    start: { year: -1750, precision: 'year' }, 
    location: { 
      lat: 32.5363, 
      lng: 44.4208, 
      placeName: 'Babylon', 
      granularity: 'city', 
      certainty: 'definite', 
      customRadius: 5000, 
      regionId: 'babylon_region' 
    }, 
    summary: 'Babylonian law code issued.' 
  },
  { 
    id: '5', 
    title: 'First Olympics', 
    start: { year: -776, precision: 'year' }, 
    location: { 
      lat: 37.6384, 
      lng: 21.6297, 
      placeName: 'Olympia', 
      granularity: 'spot', 
      certainty: 'definite' 
    }, 
    summary: 'First recorded Olympic Games.' 
  },
  { 
    id: '6', 
    title: 'Rome Founded', 
    start: { year: -753, precision: 'year' }, 
    location: { 
      lat: 41.8902, 
      lng: 12.4922, 
      placeName: 'Rome', 
      granularity: 'city', 
      certainty: 'approximate', 
      regionId: 'italy' 
    }, 
    summary: 'Legendary founding of Rome.' 
  },
  // Dummy events for testing clustering in modern era
  { 
    id: 'dummy-1', 
    title: 'Event West of Paris', 
    start: { year: 2024, precision: 'year' }, 
    location: { lat: 48.8566, lng: 2.2500, placeName: 'Paris West', granularity: 'spot', certainty: 'definite' }, 
    summary: 'Test West.' 
  },
  { 
    id: 'dummy-2', 
    title: 'Event East of Paris', 
    start: { year: 2024, precision: 'year' }, 
    location: { lat: 48.8566, lng: 2.4500, placeName: 'Paris East', granularity: 'spot', certainty: 'definite' }, 
    summary: 'Test East.' 
  },
  { 
    id: 'dummy-3', 
    title: 'Event Central Paris', 
    start: { year: 2024, precision: 'year' }, 
    location: { lat: 48.8600, lng: 2.3500, placeName: 'Paris Center', granularity: 'spot', certainty: 'definite' }, 
    summary: 'Test Center.' 
  },
  { 
    id: '7', 
    title: 'Alexander\'s Conquests', 
    start: { year: -334, precision: 'year' }, 
    end: { year: -323, precision: 'year' }, 
    location: { 
      lat: 34.0, 
      lng: 44.0, 
      placeName: 'Macedon Empire', 
      granularity: 'continent', 
      certainty: 'definite', 
      customRadius: 2000000 
    }, 
    summary: 'Alexander creates a vast empire.' 
  },
  { 
    id: '8', 
    title: 'Great Wall of China', 
    start: { year: -221, precision: 'year' }, 
    location: { 
      lat: 40.4319, 
      lng: 116.5704, 
      placeName: 'China', 
      granularity: 'territory', 
      certainty: 'definite', 
      regionId: 'china_heartland' 
    }, 
    summary: 'Qin Shi Huang begins unification of the walls.' 
  },
  { 
    id: '20', 
    title: 'Columbus Voyage', 
    start: { year: 1492, month: 10, day: 12, precision: 'day' }, 
    location: { 
      lat: 24.1167, 
      lng: -74.4667, 
      placeName: 'Bahamas', 
      granularity: 'city', 
      certainty: 'definite' 
    }, 
    summary: 'Columbus reaches Americas.' 
  },
  { 
    id: '32', 
    title: 'Meiji Restoration', 
    start: { year: 1868, precision: 'year' }, 
    location: { 
      lat: 36.2048, 
      lng: 138.2529, 
      placeName: 'Japan', 
      granularity: 'territory', 
      certainty: 'definite', 
      customRadius: 500000 
    }, 
    summary: 'Japan modernization.' 
  },
  { 
    id: '36', 
    title: 'World War I', 
    start: { year: 1914, precision: 'year' }, 
    end: { year: 1918, precision: 'year' }, 
    location: { 
      lat: 50.0, 
      lng: 10.0, 
      placeName: 'Europe', 
      granularity: 'continent', 
      certainty: 'definite', 
      regionId: 'europe' 
    }, 
    summary: 'Global conflict.' 
  }
];