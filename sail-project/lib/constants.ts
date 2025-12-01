import { EventData } from '../types';

// --- Region Definitions ---
export const PREDEFINED_REGIONS: Record<string, [number, number][]> = {
  'egypt': [[31.5, 25.0], [31.5, 34.0], [22.0, 34.0], [22.0, 25.0]],
  'italy': [[46.5, 12.0], [45.0, 13.0], [44.0, 12.5], [42.0, 14.0], [40.0, 18.0], [38.0, 16.0], [38.0, 15.5], [40.0, 15.0], [42.0, 12.0], [44.0, 10.0], [44.5, 7.0], [46.0, 7.0]],
  'europe': [[36.0, -10.0], [55.0, -10.0], [60.0, 5.0], [60.0, 30.0], [45.0, 40.0], [35.0, 25.0], [36.0, -5.0]],
  'china_heartland': [[40.0, 110.0], [40.0, 120.0], [30.0, 122.0], [22.0, 115.0], [25.0, 100.0], [35.0, 100.0]],
  'usa_east': [[45.0, -85.0], [45.0, -70.0], [30.0, -80.0], [30.0, -90.0]],
  'babylon_region': [[34.0, 42.0], [34.0, 46.0], [30.0, 48.0], [30.0, 44.0]]
};

// --- Mock Events ---
export const MOCK_EVENTS: EventData[] = [
  { 
    id: '1', 
    title: 'Great Pyramid', 
    start: { year: -2560, precision: 'year' }, 
    location: { lat: 29.9792, lng: 31.1342, placeName: 'Giza, Egypt', granularity: 'spot', certainty: 'definite', regionId: 'egypt' }, 
    summary: 'The Great Pyramid of Giza is completed.', 
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza' },
      { label: 'Britannica', url: 'https://www.britannica.com/topic/Pyramids-of-Giza' }
    ]
  },
  { 
    id: '2', 
    title: 'Code of Hammurabi', 
    start: { year: -1750, precision: 'year' }, 
    location: { lat: 32.5363, lng: 44.4208, placeName: 'Babylon', granularity: 'city', certainty: 'definite', customRadius: 5000, regionId: 'babylon_region' }, 
    summary: 'Babylonian law code issued, one of the earliest and most complete written legal codes.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Code_of_Hammurabi_Louvre_Sb8_full.jpg/360px-Code_of_Hammurabi_Louvre_Sb8_full.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Code_of_Hammurabi' }
    ]
  },
  { 
    id: '5', 
    title: 'First Olympics', 
    start: { year: -776, precision: 'year' }, 
    location: { lat: 37.6384, lng: 21.6297, placeName: 'Olympia', granularity: 'spot', certainty: 'definite' }, 
    summary: 'First recorded Olympic Games held in Olympia, Greece.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Discobolus_in_National_Roman_Museum_Palazzo_Massimo_alle_Terme.jpg/375px-Discobolus_in_National_Roman_Museum_Palazzo_Massimo_alle_Terme.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ancient_Olympic_Games' }
    ]
  },
  { 
    id: '6', 
    title: 'Rome Founded', 
    start: { year: -753, precision: 'year' }, 
    location: { lat: 41.8902, lng: 12.4922, placeName: 'Rome', granularity: 'city', certainty: 'approximate', regionId: 'italy' }, 
    summary: 'Legendary founding of Rome by Romulus and Remus.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/She-wolf_suckles_Romulus_and_Remus.jpg/640px-She-wolf_suckles_Romulus_and_Remus.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Founding_of_Rome' }
    ]
  },
  { 
    id: 'dummy-1', 
    title: 'Event West of Paris', 
    start: { year: 2024, precision: 'year' }, 
    location: { lat: 48.8566, lng: 2.2500, placeName: 'Paris West', granularity: 'spot', certainty: 'definite' }, 
    summary: 'Test West point for layout debugging.',
    imageUrl: 'https://placehold.co/600x400/e2e8f0/475569?text=Dummy+Event+A',
    sources: []
  },
  { 
    id: 'dummy-2', 
    title: 'Event East of Paris', 
    start: { year: 2024, precision: 'year' }, 
    location: { lat: 48.8566, lng: 2.4500, placeName: 'Paris East', granularity: 'spot', certainty: 'definite' }, 
    summary: 'Test East point for layout debugging.',
    imageUrl: 'https://placehold.co/600x400/e2e8f0/475569?text=Dummy+Event+B'
  },
  { 
    id: 'dummy-3', 
    title: 'Event Central Paris', 
    start: { year: 2024, precision: 'year' }, 
    location: { lat: 48.8600, lng: 2.3500, placeName: 'Paris Center', granularity: 'spot', certainty: 'definite' }, 
    summary: 'Test Center point for layout debugging.',
    imageUrl: 'https://placehold.co/600x400/e2e8f0/475569?text=Dummy+Event+C'
  },
  { 
    id: '7', 
    title: 'Alexander\'s Conquests', 
    start: { year: -334, precision: 'year' }, 
    end: { year: -323, precision: 'year' }, 
    location: { lat: 34.0, lng: 44.0, placeName: 'Macedon Empire', granularity: 'continent', certainty: 'definite', customRadius: 2000000 }, 
    summary: 'Alexander the Great creates one of the largest empires in history.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Alexander_the_Great_mosaic_%28cropped%29.jpg/440px-Alexander_the_Great_mosaic_%28cropped%29.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Wars_of_Alexander_the_Great' }
    ]
  },
  { 
    id: '8', 
    title: 'Great Wall of China', 
    start: { year: -221, precision: 'year' }, 
    location: { lat: 40.4319, lng: 116.5704, placeName: 'China', granularity: 'territory', certainty: 'definite', regionId: 'china_heartland' }, 
    summary: 'Qin Shi Huang begins unification of the walls to protect the empire.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/640px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Great_Wall_of_China' }
    ]
  },
  { 
    id: '20', 
    title: 'Columbus Voyage', 
    start: { year: 1492, month: 10, day: 12, precision: 'day' }, 
    location: { lat: 24.1167, lng: -74.4667, placeName: 'Bahamas', granularity: 'city', certainty: 'definite' }, 
    summary: 'Christopher Columbus reaches the Americas.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Landing_of_Columbus_%282%29.jpg/640px-Landing_of_Columbus_%282%29.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Voyages_of_Christopher_Columbus' }
    ]
  },
  { 
    id: '32', 
    title: 'Meiji Restoration', 
    start: { year: 1868, precision: 'year' }, 
    location: { lat: 36.2048, lng: 138.2529, placeName: 'Japan', granularity: 'territory', certainty: 'definite', customRadius: 500000 }, 
    summary: 'Japan moves from feudalism to modern imperial state.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Emperor_Meiji_1873.jpg/480px-Emperor_Meiji_1873.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Meiji_Restoration' }
    ]
  },
  { 
    id: '36', 
    title: 'World War I', 
    start: { year: 1914, precision: 'year' }, 
    end: { year: 1918, precision: 'year' }, 
    location: { lat: 50.0, lng: 10.0, placeName: 'Europe', granularity: 'continent', certainty: 'definite', regionId: 'europe' }, 
    summary: 'Global conflict originating in Europe.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Cheshire_Regiment_trench_Somme_1916.jpg/640px-Cheshire_Regiment_trench_Somme_1916.jpg',
    sources: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/World_War_I' }
    ]
  }
];