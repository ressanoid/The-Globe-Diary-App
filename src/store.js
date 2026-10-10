// --- The Globe Diary Data Store & Seed Reflections ---

const STORAGE_KEY = 'globe_diary_entries_v1';

export const INITIAL_SEEDS = [
  {
    id: 'entry_cairo_1',
    author: 'Nasser',
    text: 'Woke up before dawn for the night prayer. Living with schizophrenia used to make every morning feel overwhelming, but keeping this daily routine and writing on paper gives me deep peace. To anyone struggling right now: stability is real and possible. You are not alone.',
    feeling: 'Peaceful',
    destination: 'earth',
    locationName: 'Cairo, Egypt',
    lat: 30.0444,
    lng: 31.2357,
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 mins ago
    reactions: { notAlone: 14, warmth: 22, strength: 18 }
  },
  {
    id: 'entry_tokyo_1',
    author: 'Aoi',
    text: 'Quiet rainy evening in Shibuya. Feeling a bit anxious about tomorrow, but taking deep breaths with warm matcha. Sending a silent wish to whoever else is awake looking at the sky.',
    feeling: 'Struggling',
    destination: 'earth',
    locationName: 'Tokyo, Japan',
    lat: 35.6762,
    lng: 139.6503,
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2 hrs ago
    reactions: { notAlone: 9, warmth: 15, strength: 7 }
  },
  {
    id: 'entry_london_1',
    author: 'Elena',
    text: 'Took a solitary walk along the Thames today. Some days my mind races, but today I noticed the golden autumn leaves. One day at a time.',
    feeling: 'Hopeful',
    destination: 'earth',
    locationName: 'London, UK',
    lat: 51.5074,
    lng: -0.1278,
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5 hrs ago
    reactions: { notAlone: 12, warmth: 19, strength: 11 }
  },
  {
    id: 'entry_saopaulo_1',
    author: 'Mateo',
    text: 'A hard week at work, feeling exhausted and disconnected. Just needed a quiet place to vent and breathe. Hope tomorrow is kinder.',
    feeling: 'Overwhelmed',
    destination: 'earth',
    locationName: 'São Paulo, Brazil',
    lat: -23.5505,
    lng: -46.6333,
    timestamp: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    reactions: { notAlone: 18, warmth: 26, strength: 14 }
  },
  {
    id: 'entry_nyc_1',
    author: 'Marcus',
    text: 'Celebrated 6 months of mental health recovery today with my sister. It was a long road, but life has color again. Hold on.',
    feeling: 'Grateful',
    destination: 'earth',
    locationName: 'New York, USA',
    lat: 40.7128,
    lng: -74.0060,
    timestamp: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    reactions: { notAlone: 31, warmth: 45, strength: 38 }
  },
  {
    id: 'entry_sydney_1',
    author: 'Chloe',
    text: 'Sitting by the ocean watching the sunrise. Reminding myself that healing is not linear, and resting is not giving up.',
    feeling: 'Calm',
    destination: 'earth',
    locationName: 'Sydney, Australia',
    lat: -33.8688,
    lng: 151.2093,
    timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    reactions: { notAlone: 8, warmth: 14, strength: 10 }
  },
  // Celestial Wishes (Shooting Stars & Moon)
  {
    id: 'entry_star_1',
    author: 'Wanderer',
    text: 'Casting this into the cosmos: I hope everyone carrying heavy unseen battles finds a reason to smile today.',
    feeling: 'Hopeful',
    destination: 'shooting-star',
    locationName: 'Shooting Star Orbit',
    lat: null,
    lng: null,
    starPosition: { x: -140, y: 110, z: -80 },
    timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    reactions: { notAlone: 25, warmth: 34, strength: 29 }
  },
  {
    id: 'entry_moon_1',
    author: 'Lunar Keeper',
    text: 'A whisper to the Moon: to all the hearts hurting in the dark, may you find gentle light and quiet comfort tonight.',
    feeling: 'Peaceful',
    destination: 'moon',
    locationName: 'Lunar Surface',
    lat: null,
    lng: null,
    timestamp: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
    reactions: { notAlone: 42, warmth: 56, strength: 39 }
  }
];

export class DataStore {
  constructor() {
    this.entries = this.loadEntries();
  }

  loadEntries() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Storage read fallback to seeds:', e);
    }
    // Initialize with seeds
    this.saveEntries(INITIAL_SEEDS);
    return [...INITIAL_SEEDS];
  }

  saveEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('Storage write failed:', e);
    }
  }

  getAllEntries() {
    return [...this.entries];
  }

  getEntryById(id) {
    return this.entries.find((e) => e.id === id);
  }

  getAuthorEntries(author) {
    return this.entries
      .filter((e) => e.author.toLowerCase() === author.toLowerCase())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  addEntry(newEntry) {
    const entry = {
      ...newEntry,
      id: newEntry.id || `entry_${Date.now()}`,
      timestamp: newEntry.timestamp || new Date().toISOString(),
      reactions: newEntry.reactions || { notAlone: 0, warmth: 0, strength: 0 }
    };
    this.entries.unshift(entry);
    this.saveEntries(this.entries);
    return entry;
  }

  addReaction(entryId, reactionType) {
    const entry = this.getEntryById(entryId);
    if (!entry) return null;
    if (!entry.reactions) {
      entry.reactions = { notAlone: 0, warmth: 0, strength: 0 };
    }
    entry.reactions[reactionType] = (entry.reactions[reactionType] || 0) + 1;
    this.saveEntries(this.entries);
    return entry;
  }
}
