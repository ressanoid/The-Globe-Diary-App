// --- The Globe Diary Data Store ---
// Primary: Cloud Firestore with real-time sync.
// Fallback: localStorage (when Firebase is not configured or unreachable).
//
// The public API stays synchronous (reads served from an in-memory cache) so the
// rest of the app keeps working, while writes are mirrored to Firestore and
// applied optimistically to the cache.

import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  increment,
  query,
  orderBy
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth, isFirebaseConfigured } from './firebase.js';

const STORAGE_KEY = 'globe_diary_entries_v1';
const ENTRIES_COLLECTION = 'entries';
const REACTION_TYPES = ['notAlone', 'warmth', 'strength'];

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

// --- Pure helpers ---

const nowIso = () => new Date().toISOString();

const createId = () => `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const emptyReactions = () => ({ notAlone: 0, warmth: 0, strength: 0 });

const newestFirst = (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

/** Coerce any raw record (seed, Firestore doc, or user input) into a complete entry. */
const normalizeEntry = (raw) => ({
  ...raw,
  author: raw.author || 'Anonymous',
  text: raw.text || '',
  feeling: raw.feeling || '',
  destination: raw.destination || 'earth',
  locationName: raw.locationName || '',
  lat: raw.lat ?? null,
  lng: raw.lng ?? null,
  timestamp: raw.timestamp || nowIso(),
  reactions: { ...emptyReactions(), ...(raw.reactions || {}) }
});

/**
 * Data store facade.
 *
 * Reads are synchronous against an in-memory cache. `init()` connects to
 * Firestore (authenticating anonymously first), seeds sample data on an empty
 * database, then streams live updates via `subscribe()`.
 */
export class DataStore {
  constructor() {
    // Seed immediately so the globe has content before the network responds.
    this.entries = INITIAL_SEEDS.map(normalizeEntry).sort(newestFirst);
    this.listeners = new Set();
    this.mode = 'local';
    this._unsubscribeSnapshot = null;
  }

  /** Connect to the backend. Safe to call once, after construction. */
  async init() {
    if (!isFirebaseConfigured || !db || !auth) {
      this._initLocal();
      return this.mode;
    }

    try {
      await this._ensureAuth();
      await this._seedIfEmpty();
      this._subscribeRealtime();
      this.mode = 'firestore';
    } catch (error) {
      console.warn('Firestore unavailable — using local store instead.', error);
      this._initLocal();
    }
    return this.mode;
  }

  // --- Reads (synchronous, cache-backed) ---

  getAllEntries() {
    return [...this.entries];
  }

  getEntryById(id) {
    return this.entries.find((e) => e.id === id) || null;
  }

  getAuthorEntries(author) {
    return this.entries
      .filter((e) => e.author.toLowerCase() === String(author).toLowerCase())
      .sort(newestFirst);
  }

  // --- Writes (optimistic + persisted) ---

  addEntry(newEntry) {
    const entry = normalizeEntry({
      ...newEntry,
      id: newEntry.id || createId(),
      timestamp: newEntry.timestamp || nowIso()
    });

    this.entries = [entry, ...this.entries.filter((e) => e.id !== entry.id)].sort(newestFirst);
    this._emit();
    this._persistEntry(entry);
    return entry;
  }

  addReaction(entryId, reactionType) {
    if (!REACTION_TYPES.includes(reactionType)) return null;
    const entry = this.getEntryById(entryId);
    if (!entry) return null;

    const updated = {
      ...entry,
      reactions: { ...entry.reactions, [reactionType]: (entry.reactions[reactionType] || 0) + 1 }
    };
    this.entries = this.entries.map((e) => (e.id === entryId ? updated : e));
    this._emit();
    this._persistReaction(entryId, reactionType);
    return updated;
  }

  // --- Live updates ---

  /** Register a listener for entry-set changes. Returns an unsubscribe fn. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Internals ---

  _emit() {
    const snapshot = this.getAllEntries();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Store listener failed:', error);
      }
    });
  }

  async _ensureAuth() {
    if (auth.currentUser) return auth.currentUser;
    const credential = await signInAnonymously(auth);
    return credential.user;
  }

  async _seedIfEmpty() {
    const snapshot = await getDocs(collection(db, ENTRIES_COLLECTION));
    if (!snapshot.empty) return;

    const ownerUid = auth.currentUser?.uid || null;
    await Promise.all(
      INITIAL_SEEDS.map((seed) =>
        setDoc(doc(db, ENTRIES_COLLECTION, seed.id), { ...normalizeEntry(seed), ownerUid })
      )
    );
  }

  _subscribeRealtime() {
    if (this._unsubscribeSnapshot) this._unsubscribeSnapshot();

    const entriesQuery = query(collection(db, ENTRIES_COLLECTION), orderBy('timestamp', 'desc'));
    this._unsubscribeSnapshot = onSnapshot(
      entriesQuery,
      (snapshot) => {
        this.entries = snapshot.docs
          .map((docSnap) => normalizeEntry({ id: docSnap.id, ...docSnap.data() }))
          .sort(newestFirst);
        this._emit();
      },
      (error) => console.warn('Realtime subscription error:', error)
    );
  }

  async _persistEntry(entry) {
    if (this.mode !== 'firestore') {
      this._saveLocal(this.entries);
      return;
    }
    try {
      await setDoc(doc(db, ENTRIES_COLLECTION, entry.id), {
        ...entry,
        ownerUid: auth.currentUser?.uid || null
      });
    } catch (error) {
      console.error('Failed to persist entry to Firestore:', error);
    }
  }

  async _persistReaction(entryId, reactionType) {
    if (this.mode !== 'firestore') {
      this._saveLocal(this.entries);
      return;
    }
    try {
      await updateDoc(doc(db, ENTRIES_COLLECTION, entryId), {
        [`reactions.${reactionType}`]: increment(1)
      });
    } catch (error) {
      console.error('Failed to persist reaction to Firestore:', error);
    }
  }

  // --- Local fallback ---

  _initLocal() {
    this.entries = this._loadLocal();
    this.mode = 'local';
    this._emit();
  }

  _loadLocal() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeEntry).sort(newestFirst);
        }
      }
    } catch (error) {
      console.warn('Storage read fallback to seeds:', error);
    }
    const seeds = INITIAL_SEEDS.map(normalizeEntry).sort(newestFirst);
    this._saveLocal(seeds);
    return seeds;
  }

  _saveLocal(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.warn('Storage write failed:', error);
    }
  }
}
