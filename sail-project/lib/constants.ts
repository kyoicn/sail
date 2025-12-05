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
  // --- ANCIENT EGYPT & MESOPOTAMIA ---
  {
    id: 'pyr-1',
    title: 'Great Pyramid of Giza',
    start: { year: -2560, precision: 'year', astro_year: -2560 },
    location: { lat: 29.9792, lng: 31.1342, placeName: 'Giza, Egypt', granularity: 'spot', certainty: 'definite', regionId: 'egypt' },
    summary: 'The largest Egyptian pyramid and tomb of pharaoh Khufu.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Great_Pyramid_of_Giza' }],
    importance: 10.0
  },
  {
    id: 'ham-1',
    title: 'Code of Hammurabi',
    start: { year: -1750, precision: 'year', astro_year: -1750 },
    location: { lat: 32.5363, lng: 44.4208, placeName: 'Babylon', granularity: 'city', certainty: 'definite', customRadius: 5000, regionId: 'babylon_region' },
    summary: 'One of the earliest and most complete written legal codes.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Code_of_Hammurabi_Louvre_Sb8_full.jpg/360px-Code_of_Hammurabi_Louvre_Sb8_full.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Code_of_Hammurabi' }],
    importance: 8.5
  },

  // --- CLASSICAL ANTIQUITY (High Density Test) ---
  {
    id: 'oly-1',
    title: 'First Olympic Games',
    start: { year: -776, precision: 'year', astro_year: -776 },
    location: { lat: 37.6384, lng: 21.6297, placeName: 'Olympia, Greece', granularity: 'spot', certainty: 'definite' },
    summary: 'First recorded Olympic Games held in Olympia.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Discobolus_in_National_Roman_Museum_Palazzo_Massimo_alle_Terme.jpg/375px-Discobolus_in_National_Roman_Museum_Palazzo_Massimo_alle_Terme.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ancient_Olympic_Games' }],
    importance: 7.0
  },
  {
    id: 'rom-1',
    title: 'Founding of Rome',
    start: { year: -753, precision: 'year', astro_year: -753 },
    location: { lat: 41.8902, lng: 12.4922, placeName: 'Rome', granularity: 'city', certainty: 'approximate', regionId: 'italy' },
    summary: 'Legendary founding of Rome by Romulus.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/She-wolf_suckles_Romulus_and_Remus.jpg/640px-She-wolf_suckles_Romulus_and_Remus.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Founding_of_Rome' }],
    importance: 9.0
  },
  {
    id: 'mar-1',
    title: 'Battle of Marathon',
    start: { year: -490, precision: 'year', astro_year: -490 },
    location: { lat: 38.1189, lng: 23.9475, placeName: 'Marathon, Greece', granularity: 'spot', certainty: 'definite' },
    summary: 'Athenians defeat the first Persian invasion of Greece.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Battle_of_Marathon_Greek_retreat.jpg/640px-Battle_of_Marathon_Greek_retreat.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Battle_of_Marathon' }],
    importance: 6
  },
  {
    id: 'par-1',
    title: 'Parthenon Completed',
    start: { year: -432, precision: 'year', astro_year: -432 },
    location: { lat: 37.9715, lng: 23.7269, placeName: 'Athens', granularity: 'spot', certainty: 'definite' },
    summary: 'Dedication of the Parthenon to Athena.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/The_Parthenon_in_Athens.jpg/640px-The_Parthenon_in_Athens.jpg',
    sources: [{ label: 'History.com', url: 'https://www.history.com/topics/ancient-greece/parthenon' }],
    importance: 5
  },
  {
    id: 'alex-1',
    title: 'Alexander\'s Conquests',
    start: { year: -334, precision: 'year', astro_year: -334 },
    end: { year: -323, precision: 'year', astro_year: -323 },
    location: { lat: 34.0, lng: 44.0, placeName: 'Macedon Empire', granularity: 'continent', certainty: 'definite', customRadius: 2000000 },
    summary: 'Alexander the Great creates one of the largest empires in history.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Alexander_the_Great_mosaic_%28cropped%29.jpg/440px-Alexander_the_Great_mosaic_%28cropped%29.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Wars_of_Alexander_the_Great' }],
    importance: 9
  },
  {
    id: 'chn-1',
    title: 'Great Wall of China',
    start: { year: -221, precision: 'year', astro_year: -221 },
    location: { lat: 40.4319, lng: 116.5704, placeName: 'China', granularity: 'territory', certainty: 'definite', regionId: 'china_heartland' },
    summary: 'Qin Shi Huang begins unification of the walls.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/640px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Great_Wall_of_China' }],
    importance: 8
  },
  {
    id: 'caesar-1',
    title: 'Assassination of Julius Caesar',
    start: { year: -44, month: 3, day: 15, precision: 'day', astro_year: -44 },
    location: { lat: 41.8955, lng: 12.4722, placeName: 'Theatre of Pompey, Rome', granularity: 'spot', certainty: 'definite' },
    summary: 'Dictator Julius Caesar is assassinated by Roman senators.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Vincenzo_Camuccini_-_La_morte_di_Cesare.jpg/640px-Vincenzo_Camuccini_-_La_morte_di_Cesare.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Assassination_of_Julius_Caesar' }],
    importance: 8
  },

  // --- MIDDLE AGES & RENAISSANCE ---
  {
    id: 'rome-fall',
    title: 'Fall of Western Rome',
    start: { year: 476, precision: 'year', astro_year: 476 },
    location: { lat: 41.9028, lng: 12.4964, placeName: 'Rome', granularity: 'city', certainty: 'definite', regionId: 'italy' },
    summary: 'Romulus Augustulus is deposed, marking the end of the Western Empire.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Course_of_Empire_Destruction.jpg/640px-Course_of_Empire_Destruction.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fall_of_the_Western_Roman_Empire' }],
    importance: 9
  },
  {
    id: 'magna-1',
    title: 'Magna Carta',
    start: { year: 1215, month: 6, day: 15, precision: 'day', astro_year: 1215 },
    location: { lat: 51.4446, lng: -0.5655, placeName: 'Runnymede, UK', granularity: 'spot', certainty: 'definite' },
    summary: 'King John agrees to the Magna Carta, limiting royal power.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Magna_Carta_%28British_Library_Cotton_MS_Augustus_II.106%29.jpg/600px-Magna_Carta_%28British_Library_Cotton_MS_Augustus_II.106%29.jpg',
    sources: [{ label: 'British Library', url: 'https://www.bl.uk/magna-carta' }],
    importance: 7
  },
  {
    id: 'columbus-1',
    title: 'Columbus Voyage',
    start: { year: 1492, month: 10, day: 12, precision: 'day', astro_year: 1492 },
    location: { lat: 24.1167, lng: -74.4667, placeName: 'Bahamas', granularity: 'city', certainty: 'definite' },
    summary: 'Christopher Columbus reaches the Americas.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Landing_of_Columbus_%282%29.jpg/640px-Landing_of_Columbus_%282%29.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Voyages_of_Christopher_Columbus' }],
    importance: 9
  },

  // --- MODERN ERA (Clustering Test) ---
  {
    id: 'indep-1',
    title: 'US Declaration of Independence',
    start: { year: 1776, month: 7, day: 4, precision: 'day', astro_year: 1776 },
    location: { lat: 39.9489, lng: -75.1500, placeName: 'Philadelphia, USA', granularity: 'city', certainty: 'definite', regionId: 'usa_east' },
    summary: 'The Thirteen Colonies declare independence from Britain.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Declaration_independence.jpg/640px-Declaration_independence.jpg',
    sources: [{ label: 'Archives.gov', url: 'https://www.archives.gov/founding-docs/declaration-transcript' }],
    importance: 8
  },
  {
    id: 'fr-rev',
    title: 'Storming of the Bastille',
    start: { year: 1789, month: 7, day: 14, precision: 'day', astro_year: 1789 },
    location: { lat: 48.8532, lng: 2.3691, placeName: 'Paris, France', granularity: 'spot', certainty: 'definite' },
    summary: 'Flashpoint of the French Revolution.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Prise_de_la_Bastille.jpg/640px-Prise_de_la_Bastille.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Storming_of_the_Bastille' }],
    importance: 8
  },
  {
    id: 'meiji-1',
    title: 'Meiji Restoration',
    start: { year: 1868, precision: 'year', astro_year: 1868 },
    location: { lat: 36.2048, lng: 138.2529, placeName: 'Japan', granularity: 'territory', certainty: 'definite', customRadius: 500000 },
    summary: 'Japan moves from feudalism to modern imperial state.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Emperor_Meiji_1873.jpg/480px-Emperor_Meiji_1873.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Meiji_Restoration' }],
    importance: 7
  },
  {
    id: 'wright-1',
    title: 'First Flight',
    start: { year: 1903, month: 12, day: 17, precision: 'day', astro_year: 1903 },
    location: { lat: 36.0199, lng: -75.6688, placeName: 'Kitty Hawk, NC', granularity: 'spot', certainty: 'definite' },
    summary: 'Wright brothers complete the first powered flight.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Kitty_hawk_gross.jpg/640px-Kitty_hawk_gross.jpg',
    sources: [{ label: 'Airandspace.si.edu', url: 'https://airandspace.si.edu/' }],
    importance: 7
  },
  {
    id: 'ww1-1',
    title: 'World War I',
    start: { year: 1914, precision: 'year', astro_year: 1914 },
    end: { year: 1918, precision: 'year', astro_year: 1918 },
    location: { lat: 50.0, lng: 10.0, placeName: 'Europe', granularity: 'continent', certainty: 'definite', regionId: 'europe' },
    summary: 'Global conflict originating in Europe.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Cheshire_Regiment_trench_Somme_1916.jpg/640px-Cheshire_Regiment_trench_Somme_1916.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/World_War_I' }],
    importance: 10.0
  },
  {
    id: 'ww2-start',
    title: 'World War II Begins',
    start: { year: 1939, month: 9, day: 1, precision: 'day', astro_year: 1939 },
    location: { lat: 52.0, lng: 20.0, placeName: 'Poland/Europe', granularity: 'continent', certainty: 'definite' },
    summary: 'Germany invades Poland, starting WWII.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Bundesarchiv_Bild_101I-380-0082-33%2C_Polen%2C_Schlagbaum_Grenz%C3%BCbergang.jpg/640px-Bundesarchiv_Bild_101I-380-0082-33%2C_Polen%2C_Schlagbaum_Grenz%C3%BCbergang.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Invasion_of_Poland' }],
    importance: 10
  },
  {
    id: 'dday-1',
    title: 'D-Day Landings',
    start: { year: 1944, month: 6, day: 6, precision: 'day', astro_year: 1944 },
    location: { lat: 49.3333, lng: -0.6, placeName: 'Normandy, France', granularity: 'spot', certainty: 'definite' },
    summary: 'Allied forces invade northern France.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Into_the_Jaws_of_Death_23-0455M_edit.jpg/640px-Into_the_Jaws_of_Death_23-0455M_edit.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Normandy_landings' }],
    importance: 8
  },
  {
    id: 'nuke-1',
    title: 'Atomic Bombing of Hiroshima',
    start: { year: 1945, month: 8, day: 6, precision: 'day', astro_year: 1945 },
    location: { lat: 34.3853, lng: 132.4553, placeName: 'Hiroshima, Japan', granularity: 'city', certainty: 'definite' },
    summary: 'First use of nuclear weapons in warfare.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Atomic_bombing_of_Japan.jpg/580px-Atomic_bombing_of_Japan.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Atomic_bombings_of_Hiroshima_and_Nagasaki' }],
    importance: 9
  },
  {
    id: 'moon-1',
    title: 'Apollo 11 Landing',
    start: { year: 1969, month: 7, day: 20, precision: 'day', astro_year: 1969 },
    location: { lat: 28.5729, lng: -80.6490, placeName: 'Cape Kennedy (Launch)', granularity: 'spot', certainty: 'definite' },
    summary: 'Humans walk on the Moon for the first time.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Aldrin_Apollo_11_original.jpg/600px-Aldrin_Apollo_11_original.jpg',
    sources: [{ label: 'NASA', url: 'https://www.nasa.gov/mission_pages/apollo/apollo11.html' }],
    importance: 10
  },
  {
    id: 'berlin-wall',
    title: 'Fall of Berlin Wall',
    start: { year: 1989, month: 11, day: 9, precision: 'day', astro_year: 1989 },
    location: { lat: 52.5163, lng: 13.3777, placeName: 'Berlin, Germany', granularity: 'city', certainty: 'definite' },
    summary: 'Symbolic end of the Cold War.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Berlinermauer.jpg/640px-Berlinermauer.jpg',
    sources: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fall_of_the_Berlin_Wall' }],
    importance: 8
  },

  // --- LOD TESTERS (Low Importance, High Density) ---
  // Only visible when zoomed into Paris + Recent Times
  { id: 'dummy-1', title: 'Local Art Fair', start: { year: 2024, astro_year: 2024, precision: 'year' }, location: { lat: 48.8566, lng: 2.3400, placeName: 'Paris 1', granularity: 'spot', certainty: 'definite' }, summary: 'Minor local event.', imageUrl: '', sources: [], importance: 2.0 },
  { id: 'dummy-2', title: 'Metro Construction', start: { year: 2024, astro_year: 2024, precision: 'year' }, location: { lat: 48.8600, lng: 2.3500, placeName: 'Paris 2', granularity: 'spot', certainty: 'definite' }, summary: 'Minor local event.', imageUrl: '', sources: [], importance: 2.0 },
  { id: 'dummy-3', title: 'Cafe Opening', start: { year: 2024, astro_year: 2024, precision: 'year' }, location: { lat: 48.8500, lng: 2.3600, placeName: 'Paris 3', granularity: 'spot', certainty: 'definite' }, summary: 'Minor local event.', imageUrl: '', sources: [], importance: 2.0 },
  { id: 'dummy-4', title: 'Park Renovation', start: { year: 2024, astro_year: 2024, precision: 'year' }, location: { lat: 48.8700, lng: 2.3300, placeName: 'Paris 4', granularity: 'spot', certainty: 'definite' }, summary: 'Minor local event.', imageUrl: '', sources: [], importance: 2.0 },

  // --- PRECISION TEST (Millisecond Scale) ---
  // A hypothetical high-speed event: "Flash Photography"
  // Year: 2025 AD
  // Day: 50th day (approx Feb 19)
  // Time: 12:00:00.123
  {
    id: 'precision-1',
    title: 'High-Speed Camera Test',
    start: {
      year: 2025,
      precision: 'millisecond',
      astro_year: 2025.135616780822 // Manually calculated for 2025 (365 days) -> (49 + 12.000034/24)/365
    },
    location: { lat: 35.6762, lng: 139.6503, placeName: 'Tokyo Lab', granularity: 'spot', certainty: 'definite' },
    summary: 'Testing millisecond timestamp rendering.',
    imageUrl: '',
    sources: [],
    importance: 5.0
  }
];